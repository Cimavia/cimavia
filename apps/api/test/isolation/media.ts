import {
  MAX_FEEDBACK_AUDIOS,
  MAX_FEEDBACK_PHOTOS,
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MAX_FEEDBACK_VIDEO_SIZE_BYTES,
  MAX_FEEDBACK_VIDEOS,
  MULTIPART_PART_SIZE_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  multipartPartCount,
  multipartPartSizes,
  Role,
} from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, link, openWith, required, signUp } from "../support/actors";
import { mondayOfCurrentWeek } from "../support/fixtures";
import { deleteAtLatest } from "../support/version";

describe("Médias de débrief (P4)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let athleteB1: Agent;
  let sessionId: string;
  let a1Id: string;

  const monday = mondayOfCurrentWeek();

  const photo = (fileName = "voie.jpg") => ({
    type: "IMAGE",
    fileName,
    mimeType: "image/jpeg",
    size: 120_000,
  });
  const video = (fileName = "essai.mp4") => ({
    type: "VIDEO",
    fileName,
    mimeType: "video/mp4",
    size: 8_000_000,
    durationSeconds: 42,
  });
  const audio = (fileName = "note.m4a") => ({
    type: "AUDIO",
    fileName,
    mimeType: "audio/m4a",
    size: 200_000,
    durationSeconds: 18,
  });

  // Parcours réel : URL signée → PUT direct vers le storage → rattachement.
  async function upload(agent: Agent, input: Record<string, unknown>): Promise<string> {
    const signed = await agent
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(input);
    expect(signed.status).toBe(201);

    // `content-length` n'est PAS posé à la main : undici le refuse et le calcule lui-même depuis
    // le corps. C'est justement ce qu'on veut vérifier — l'URL étant signée avec la taille
    // annoncée à l'API, l'upload ne passe que si le poids réel correspond.
    const body = Buffer.alloc(input.size as number, 1);
    const put = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body,
      headers: { "content-type": input.mimeType as string },
    });
    expect(put.status).toBe(200);

    return signed.body.storagePath;
  }

  beforeAll(async () => {
    coachA = await signUp("media-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("media-athlete-a1@cmv.test", Role.ATHLETE);
    const coachB = await signUp("media-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("media-athlete-b1@cmv.test", Role.ATHLETE);

    a1Id = await link(coachA, athleteA1);
    await link(coachB, athleteB1);

    const plan = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle médias",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await coachA
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title: "Séance filmée", scheduledDate: monday });
    sessionId = session.body.id;
    await billAndPublish(coachA, plan.body.id);
  });

  it("rattache une photo à une séance jamais débriefée : le débrief est créé, la séance passe DONE", async () => {
    const storagePath = await upload(athleteA1, photo());
    const attached = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
      .send({ ...photo(), storagePath });
    expect(attached.status).toBe(201);
    expect(attached.body).toMatchObject({
      type: "IMAGE",
      fileName: "voie.jpg",
      sizeBytes: 120_000,
    });
    // Média = fichier privé : l'URL de lecture est toujours signée, jamais publique.
    expect(attached.body.url).toContain("X-Amz-Signature");
    expect(attached.body.durationSeconds).toBeNull();

    const feedback = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    expect(feedback.body.content).toBeNull(); // débrief média-seul
    expect(feedback.body.media).toHaveLength(1);

    const session = await athleteA1.get(`/me/scheduled-sessions/${sessionId}`);
    expect(session.body.status).toBe("DONE");
  });

  /**
   * #313 : la suppression partait en cascade — débrief, médias en base, suivi — et laissait les
   * objets dans le bucket, sans que l'athlète en sache rien. Elle est refusée, et ce test vérifie
   * que RIEN n'a bougé : la séance, le débrief, la ligne du média ET l'objet lui-même.
   */
  it("refuse de supprimer une séance débriefée (409) : séance, débrief et objet restent", async () => {
    const notificationsBefore = (await athleteA1.get("/me/notifications")).body.length;

    const refused = await deleteAtLatest(coachA, `/scheduled-sessions/${sessionId}`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain("débriefée");

    expect((await coachA.get(`/scheduled-sessions/${sessionId}`)).body.status).toBe("DONE");
    const feedback = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    expect(feedback.status).toBe(200);
    expect(feedback.body.media).toHaveLength(1);
    // L'objet est toujours servi : l'URL signée ne prouve rien seule, le GET si.
    expect((await fetch(feedback.body.media[0].url)).status).toBe(200);

    // Rien n'a été retiré : aucune annonce de retrait ne doit partir vers l'athlète.
    expect((await athleteA1.get("/me/notifications")).body).toHaveLength(notificationsBefore);
  });

  /**
   * #537 : un média ajouté SEUL rend le débrief à relire, comme le texte — il ne remontait pas dans
   * la tuile du coach. Le complément pousse sans trace : l'entrée « nouveau débrief » du centre
   * ouvre déjà l'état courant. La vidéo est retirée aussitôt : les quotas plus bas en comptent zéro.
   */
  it("un média ajouté seul rend le débrief à relire, sans seconde entrée au centre", async () => {
    const [listed] = (await coachA.get("/feedbacks")).body;
    expect((await coachA.post(`/feedbacks/${listed.id}/read`)).status).toBe(201);
    const traces = async () =>
      (await coachA.get("/me/notifications")).body.filter(
        (n: { type: string }) => n.type === "FEEDBACK_RECEIVED",
      ).length;
    const before = await traces();

    const storagePath = await upload(athleteA1, video());
    const attached = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
      .send({ ...video(), storagePath });
    expect(attached.status).toBe(201);

    expect((await coachA.get("/feedbacks")).body[0].coachReadAt).toBeNull();
    expect(await traces()).toBe(before);

    const removed = await athleteA1.delete(
      `/me/scheduled-sessions/${sessionId}/feedback/media/${attached.body.id}`,
    );
    expect(removed.status).toBe(204);
  });

  // Débrief vocal (P5, CDC §4) : même flux que photo/vidéo, MediaType étendu à AUDIO.
  it("rattache une note vocale au débrief (durée conservée)", async () => {
    const storagePath = await upload(athleteA1, audio());
    const attached = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
      .send({ ...audio(), storagePath });
    expect(attached.status).toBe(201);
    expect(attached.body).toMatchObject({
      type: "AUDIO",
      fileName: "note.m4a",
      durationSeconds: 18,
    });
    expect(attached.body.url).toContain("X-Amz-Signature");
  });

  /**
   * Le plafond vient de la CONSTANTE, jamais d'un chiffre écrit ici : `MAX_FEEDBACK_AUDIOS` est
   * passé de 3 à 15 en cours de route, et ce test s'est mis à échouer sans que rien ne le signale
   * — les e2e ne tournent pas dans la CI (`turbo test` n'appelle pas `test:e2e`).
   */
  it("plafonne les notes vocales par débrief (409)", async () => {
    // Une note est déjà posée par le test précédent.
    for (let index = 0; index < MAX_FEEDBACK_AUDIOS - 1; index += 1) {
      const storagePath = await upload(athleteA1, audio(`note-${index}.m4a`));
      const res = await athleteA1
        .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
        .send({ ...audio(`note-${index}.m4a`), storagePath });
      expect(res.status).toBe(201);
    }
    // La suivante dépasse le plafond.
    const overflow = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(audio("trop.m4a"));
    expect(overflow.status).toBe(409);
  });

  it("refuse un mime audio non supporté (400)", async () => {
    const res = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send({ ...audio(), mimeType: "audio/webm" });
    expect(res.status).toBe(400);
  });

  it("demander une URL d'upload ne débriefe pas à soi seul (une capture abandonnée n'engage rien)", async () => {
    const other = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle témoin",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await coachA
      .post(`/plan-weeks/${other.body.weeks[0].id}/sessions`)
      .send({ title: "Séance témoin", scheduledDate: monday });
    await billAndPublish(coachA, other.body.id);

    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${session.body.id}/feedback/media/upload-url`)
      .send(photo());
    expect(signed.status).toBe(201);

    expect(
      (await athleteA1.get(`/me/scheduled-sessions/${session.body.id}/feedback`)).body,
    ).toBeNull();
    expect((await athleteA1.get(`/me/scheduled-sessions/${session.body.id}`)).body.status).toBe(
      "PLANNED",
    );
  });

  // Sans la taille dans la signature, un client pourrait déclarer 8 Mo puis pousser ce qu'il
  // veut : le plafond du schéma ne serait qu'une politesse.
  it("le storage refuse un envoi plus lourd que la taille signée", async () => {
    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(photo("menteuse.jpg"));
    expect(signed.status).toBe(201);

    const tooBig = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(120_000 * 2, 1),
      headers: { "content-type": "image/jpeg" },
    });
    expect(tooBig.ok).toBe(false);
  });

  it("plafonne les vidéos d'un débrief (409 sur celle de trop)", async () => {
    // Le plafond vient de la CONSTANTE, jamais d'un chiffre écrit ici : relevé en #156, il aurait
    // rendu ce test rouge sans qu'aucune règle n'ait changé.
    for (let i = 0; i < MAX_FEEDBACK_VIDEOS; i++) {
      const storagePath = await upload(athleteA1, video(`essai-${i}.mp4`));
      const res = await athleteA1
        .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
        .send({ ...video(`essai-${i}.mp4`), storagePath });
      expect(res.status).toBe(201);
    }

    // Le quota est refusé DÈS la demande d'URL : pas d'upload de 50 Mo pour s'entendre dire non.
    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(video("de-trop.mp4"));
    expect(signed.status).toBe(409);
  });

  it("les photos ont leur propre quota, indépendant des vidéos", async () => {
    // Démarre à 1 : une photo est déjà attachée par un test précédent de ce même débrief.
    for (let i = 1; i < MAX_FEEDBACK_PHOTOS; i++) {
      const storagePath = await upload(athleteA1, photo(`voie-${i}.jpg`));
      const res = await athleteA1
        .post(`/me/scheduled-sessions/${sessionId}/feedback/media`)
        .send({ ...photo(`voie-${i}.jpg`), storagePath });
      expect(res.status).toBe(201);
    }

    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(photo("de-trop.jpg"));
    expect(signed.status).toBe(409);
  });

  it("supprimer un média libère une place dans le quota", async () => {
    const feedback = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    const firstPhoto = feedback.body.media.find((m: { type: string }) => m.type === "IMAGE");

    const removed = await athleteA1.delete(
      `/me/scheduled-sessions/${sessionId}/feedback/media/${firstPhoto.id}`,
    );
    expect(removed.status).toBe(204);

    const signed = await athleteA1
      .post(`/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`)
      .send(photo("remplacement.jpg"));
    expect(signed.status).toBe(201);
  });

  // Les plafonds vivent dans le schéma partagé → rejet AVANT le service, sans code dédié.
  it("mime, taille et durée sont validés par le schéma partagé (400)", async () => {
    const url = `/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`;

    expect((await athleteA1.post(url).send({ ...video(), mimeType: "video/avi" })).status).toBe(
      400,
    );
    // Bornes dérivées des constantes : écrites en dur, elles cesseraient de tester le plafond
    // réel au premier ajustement — c'est exactement ce qui est arrivé (50 Mo → 1 Go).
    expect(
      (await athleteA1.post(url).send({ ...video(), size: MAX_FEEDBACK_VIDEO_SIZE_BYTES + 1 }))
        .status,
    ).toBe(400);
    expect(
      (
        await athleteA1
          .post(url)
          .send({ ...video(), durationSeconds: MAX_FEEDBACK_VIDEO_DURATION_SECONDS + 1 })
      ).status,
    ).toBe(400);
    // Une vidéo sans durée déclarée : la branche VIDEO l'exige.
    expect(
      (await athleteA1.post(url).send({ ...video(), durationSeconds: undefined })).status,
    ).toBe(400);
  });

  it("un athlète ne dépose ni ne supprime de média sur la séance d'un autre", async () => {
    const url = `/me/scheduled-sessions/${sessionId}/feedback/media`;
    expect((await athleteB1.post(`${url}/upload-url`).send(photo())).status).toBe(404);
    expect(
      (await athleteB1.post(url).send({ ...photo(), storagePath: "athlete/x/voie.jpg" })).status,
    ).toBe(404);

    const feedback = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    const mediaId = feedback.body.media[0].id;
    expect((await athleteB1.delete(`${url}/${mediaId}`)).status).toBe(404);
  });

  // Sa propre séance, mais un média qui n'y est pas : 404, et le débrief ne perd rien.
  it("supprimer un média absent de la séance répond 404 sans rien retirer", async () => {
    const url = `/me/scheduled-sessions/${sessionId}/feedback/media`;
    const before = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);

    const res = await athleteA1.delete(`${url}/media-inconnu`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Média introuvable");
    const after = await athleteA1.get(`/me/scheduled-sessions/${sessionId}/feedback`);
    expect(after.body.media).toHaveLength(before.body.media.length);
  });

  it("le dépôt de médias reste interdit au coach", async () => {
    const url = `/me/scheduled-sessions/${sessionId}/feedback/media`;
    expect((await coachA.post(`${url}/upload-url`).send(photo())).status).toBe(403);
  });

  /**
   * Envoi découpé — ce qui se passe au-delà du seuil, le PUT unique ne franchissant pas le bord
   * réseau (100 Mo mesurés). Séance DÉDIÉE : les tests de quota ci-dessus ont déjà attaché 3
   * vidéos à `sessionId`, et toute demande d'URL y répondrait 409 avant d'atteindre ce qu'on veut
   * tester.
   */
  describe("upload découpé", () => {
    let bigSessionId: string;
    let mediaUrl: string;

    // La plus petite vidéo qui force le découpage : un octet de plus que le seuil.
    const bigVideo = (fileName = "longue.mp4") => ({
      type: "VIDEO",
      fileName,
      mimeType: "video/mp4",
      size: MULTIPART_THRESHOLD_BYTES + 1,
      durationSeconds: 120,
    });

    async function ticketFor(input: Record<string, unknown>) {
      const signed = await athleteA1.post(`${mediaUrl}/upload-url`).send(input);
      expect(signed.status).toBe(201);
      return signed.body;
    }

    // `content-type` n'est PAS envoyé : `UploadPartCommand` ne le signe pas (le type de l'objet
    // est fixé à l'ouverture de l'upload). Seul `content-length` l'est, et undici le calcule.
    async function putPart(url: string, size: number): Promise<number> {
      const put = await fetch(url, { method: "PUT", body: Buffer.alloc(size, 1) });
      return put.status;
    }

    beforeAll(async () => {
      const plan = await coachA.post("/plans").send({
        athleteId: a1Id,
        title: "Cycle envoi découpé",
        startDate: monday,
        weeks: [{ type: "TRAINING" }],
      });
      const session = await coachA
        .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
        .send({ title: "Séance vidéo longue", scheduledDate: monday });
      await billAndPublish(coachA, plan.body.id);

      bigSessionId = session.body.id;
      mediaUrl = `/me/scheduled-sessions/${bigSessionId}/feedback/media`;
    });

    it("bascule en découpé au-delà du seuil, et pas avant", async () => {
      // Le seuil est INCLUSIF : pile dessus, le PUT unique passe encore.
      const single = await ticketFor({ ...video("juste.mp4"), size: MULTIPART_THRESHOLD_BYTES });
      expect(single.mode).toBe("SINGLE");
      expect(single.uploadUrl).toBeDefined();

      const multi = await ticketFor(bigVideo());
      expect(multi.mode).toBe("MULTIPART");
      expect(multi.partSize).toBe(MULTIPART_PART_SIZE_BYTES);
      const expectedParts = multipartPartCount(MULTIPART_THRESHOLD_BYTES + 1);
      expect(expectedParts).not.toBeNull();
      expect(multi.partUrls).toHaveLength(expectedParts ?? 0);
      // Le mode dicte la forme : aucun `uploadUrl` unique à envoyer par erreur.
      expect(multi.uploadUrl).toBeUndefined();
    });

    it("parcours complet : parts, clôture, puis rattachement", async () => {
      const input = bigVideo("parcours.mp4");
      const ticket = await ticketFor(input);
      const sizes = multipartPartSizes(input.size) ?? [];

      for (const [index, partUrl] of (ticket.partUrls as string[]).entries()) {
        expect(await putPart(partUrl, sizes[index] ?? 0)).toBe(200);
      }

      const completed = await athleteA1.post(`${mediaUrl}/upload/complete`).send({
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        partCount: ticket.partUrls.length,
      });
      expect(completed.status).toBe(204);

      // L'objet recollé se rattache comme n'importe quel média : le découpage ne se voit plus.
      const attached = await athleteA1
        .post(mediaUrl)
        .send({ ...input, storagePath: ticket.storagePath });
      expect(attached.status).toBe(201);
    });

    /**
     * LE test de ce commit. S3 recolle sans broncher ce qu'on lui donne : sans ce refus, une part
     * perdue produirait une vidéo tronquée que rien ne distingue d'une vidéo entière — ni le
     * storage, ni le rattachement, ni la lecture par le coach.
     */
    it("refuse de clore un upload auquel il manque une part (409)", async () => {
      const input = bigVideo("tronquee.mp4");
      const ticket = await ticketFor(input);
      const sizes = multipartPartSizes(input.size) ?? [];

      expect(await putPart(ticket.partUrls[0], sizes[0] ?? 0)).toBe(200);

      const completed = await athleteA1.post(`${mediaUrl}/upload/complete`).send({
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        // Une seule part envoyée, mais on prétend les avoir toutes montées.
        partCount: ticket.partUrls.length,
      });
      expect(completed.status).toBe(409);
    });

    it("l'abandon purge les parts, et la clôture répond alors 404", async () => {
      const input = bigVideo("abandonnee.mp4");
      const ticket = await ticketFor(input);
      const sizes = multipartPartSizes(input.size) ?? [];
      expect(await putPart(ticket.partUrls[0], sizes[0] ?? 0)).toBe(200);

      const aborted = await athleteA1
        .post(`${mediaUrl}/upload/abort`)
        .send({ storagePath: ticket.storagePath, uploadId: ticket.uploadId });
      expect(aborted.status).toBe(204);

      const completed = await athleteA1.post(`${mediaUrl}/upload/complete`).send({
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        partCount: 1,
      });
      expect(completed.status).toBe(404);
    });

    /**
     * Le `storagePath` de la clôture désigne un objet du bucket sans être construit par l'API —
     * comme celui du rattachement (#293, bloc dédié en fin de fichier). Le tenancy guard protège
     * la base, pas le storage.
     */
    it("refuse un chemin de storage hors du périmètre de la séance (403)", async () => {
      const ticket = await ticketFor(bigVideo("evasion.mp4"));

      const completed = await athleteA1.post(`${mediaUrl}/upload/complete`).send({
        storagePath: "athlete/quelqu-un-dautre/feedback/ailleurs/objet.mp4",
        uploadId: ticket.uploadId,
        partCount: 1,
      });
      expect(completed.status).toBe(403);
    });

    it("un athlète ne clôt ni n'abandonne l'upload d'un autre", async () => {
      const ticket = await ticketFor(bigVideo("convoitee.mp4"));
      const payload = {
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        partCount: 1,
      };

      // 404 et non 403 : la séance elle-même n'existe pas pour B1.
      expect((await athleteB1.post(`${mediaUrl}/upload/complete`).send(payload)).status).toBe(404);
      expect(
        (
          await athleteB1
            .post(`${mediaUrl}/upload/abort`)
            .send({ storagePath: ticket.storagePath, uploadId: ticket.uploadId })
        ).status,
      ).toBe(404);
    });

    it("la clôture reste interdite au coach", async () => {
      const res = await coachA
        .post(`${mediaUrl}/upload/complete`)
        .send({ storagePath: "athlete/x/feedback/y/z.mp4", uploadId: "u", partCount: 1 });
      expect(res.status).toBe(403);
    });
  });
});

/**
 * Les quatre rattachements reçoivent une clé objet du CLIENT. Le tenancy guard protège la base, pas
 * le storage : sans garde, la clé d'un autre tenant s'enregistrait telle quelle, et la suppression
 * du rattachement purgeait ensuite l'objet chez son propriétaire (#293). Chaque cas vise donc un
 * objet RÉEL, et vérifie après le refus qu'on le lit toujours.
 */
describe("Rattacher la clé objet d'un autre tenant (#293)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let targetSessionId: string;
  let mediaSessionId: string;
  let draftPlanId: string;
  let conversationId: string;
  let exerciseAId: string;

  const monday = mondayOfCurrentWeek();
  const pdf = { fileName: "fiche.pdf", mimeType: "application/pdf", size: 2_000 };
  const pdfDocument = { type: "FILE", ...pdf };
  const photo = { type: "IMAGE", fileName: "voie.jpg", mimeType: "image/jpeg", size: 2_000 };

  async function put(uploadUrl: string, mimeType: string, size: number): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(size, 1),
      headers: { "content-type": mimeType },
    });
    expect(res.status).toBe(200);
  }

  // Un document RÉEL de la bibliothèque du coach : sa clé, et le statut d'une relecture de l'objet.
  async function coachDocument(
    coach: Agent,
  ): Promise<{ storagePath: string; exists: () => Promise<number> }> {
    const exercise = await coach.post("/exercises").send({ title: "Fiche convoitée" });
    const url = `/exercises/${exercise.body.id}/documents`;
    const signed = await coach.post(`${url}/upload-url`).send(pdf);
    await put(signed.body.uploadUrl, pdf.mimeType, pdf.size);
    const attached = await coach
      .post(url)
      .send({ ...pdfDocument, storagePath: signed.body.storagePath });
    expect(attached.status).toBe(201);

    return {
      storagePath: signed.body.storagePath,
      exists: async () => {
        const detail = await coach.get(`/exercises/${exercise.body.id}`);
        return (await fetch(required(detail.body.documents[0], "document").url)).status;
      },
    };
  }

  beforeAll(async () => {
    coachA = await signUp("key-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("key-athlete-a1@cmv.test", Role.ATHLETE);
    coachB = await signUp("key-coach-b@cmv.test", Role.COACH);
    const a1Id = await link(coachA, athleteA1);

    // Un cycle diffusé à deux séances : l'une porte la vidéo de l'athlète, l'autre sert de cible.
    const plan = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle diffusé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const sessionsUrl = `/plan-weeks/${plan.body.weeks[0].id}/sessions`;
    const session = (title: string) =>
      coachA.post(sessionsUrl).send({ title, scheduledDate: monday });
    mediaSessionId = (await session("Séance filmée")).body.id;
    targetSessionId = (await session("Séance cible")).body.id;
    await billAndPublish(coachA, plan.body.id);

    // Un brouillon facturé, pour le justificatif.
    const draft = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle brouillon",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    draftPlanId = draft.body.id;
    await coachA.put(`/plans/${draftPlanId}/billing`).send({ amountCents: 5000, dueDate: monday });

    conversationId = (await openWith(coachA, a1Id, "athlete")).body.id;
    exerciseAId = (await coachA.post("/exercises").send({ title: "Exercice cible" })).body.id;
  });

  it("un athlète ne rattache pas à son débrief le document de son coach", async () => {
    const victim = await coachDocument(coachA);
    const url = `/me/scheduled-sessions/${targetSessionId}/feedback`;

    const res = await athleteA1
      .post(`${url}/media`)
      .send({ ...photo, storagePath: victim.storagePath });
    expect(res.status).toBe(403);

    // Refusé AVANT de créer le débrief : la séance n'est pas passée DONE pour autant.
    expect((await athleteA1.get(url)).body).toBeNull();
    expect(await victim.exists()).toBe(200);
  });

  it("un coach ne rattache pas à son exercice la vidéo de son athlète", async () => {
    const url = `/me/scheduled-sessions/${mediaSessionId}/feedback`;
    const signed = await athleteA1.post(`${url}/media/upload-url`).send(photo);
    await put(signed.body.uploadUrl, photo.mimeType, photo.size);
    const media = await athleteA1
      .post(`${url}/media`)
      .send({ ...photo, storagePath: signed.body.storagePath });
    expect(media.status).toBe(201);

    const res = await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ ...pdfDocument, storagePath: signed.body.storagePath });
    expect(res.status).toBe(403);

    const feedback = await athleteA1.get(url);
    const stored = required(feedback.body.media[0], "média du débrief");
    expect((await fetch(stored.url)).status).toBe(200);
  });

  it("un message ne porte pas la clé d'un document d'un autre coach", async () => {
    const victim = await coachDocument(coachB);
    const url = `/conversations/${conversationId}/messages`;
    // Compté avant : le fil porte déjà l'annonce du média de débrief joint plus haut (#96).
    const before = (await athleteA1.get(url)).body.length;

    const res = await athleteA1.post(url).send({ ...photo, storagePath: victim.storagePath });
    expect(res.status).toBe(403);

    expect((await athleteA1.get(url)).body).toHaveLength(before);
    expect(await victim.exists()).toBe(200);
  });

  it("un justificatif de facture ne pointe pas le document d'un autre coach", async () => {
    const victim = await coachDocument(coachB);

    const res = await coachA
      .put(`/plans/${draftPlanId}/billing/document`)
      .send({ ...pdf, storagePath: victim.storagePath });
    expect(res.status).toBe(403);

    expect((await coachA.get(`/plans/${draftPlanId}/billing`)).body.documentFileName).toBeNull();
    expect(await victim.exists()).toBe(200);
  });
});
