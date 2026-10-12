import { MULTIPART_THRESHOLD_BYTES, multipartPartSizes, Role } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Agent,
  billAndPublish,
  link,
  linkRelation,
  required,
  signUp,
} from "../support/actors";
import { mondayOfCurrentWeek } from "../support/fixtures";

describe("Messagerie : fil texte & isolation (P5)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let athleteB1: Agent;
  let autonome: Agent;
  let a1Id: string;
  let coachAId: string;
  let conversationId: string;

  beforeAll(async () => {
    coachA = await signUp("msg-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("msg-athlete-a1@cmv.test", Role.ATHLETE);
    coachB = await signUp("msg-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("msg-athlete-b1@cmv.test", Role.ATHLETE);
    autonome = await signUp("msg-autonome@cmv.test", Role.ATHLETE);

    const relation = await linkRelation(coachA, athleteA1);
    a1Id = relation.athleteId;
    coachAId = relation.coachId;
    await link(coachB, athleteB1);
  });

  it("le coach ouvre un fil avec SON athlète (get-or-create, contrepartie nommée)", async () => {
    const res = await coachA.post("/conversations").send({ athleteId: a1Id });
    expect(res.status).toBe(201);
    expect(res.body.counterpartId).toBe(a1Id);
    expect(res.body.counterpartName).toBe("msg-athlete-a1@cmv.test");
    expect(res.body.lastMessageAt).toBeNull();
    expect(res.body.unreadCount).toBe(0);
    conversationId = res.body.id;

    // Idempotent : réouvrir renvoie le MÊME fil, pas un doublon.
    const again = await coachA.post("/conversations").send({ athleteId: a1Id });
    expect(again.body.id).toBe(conversationId);
  });

  it("l'athlète ouvre SON fil (même conversation, contrepartie = le coach)", async () => {
    const res = await athleteA1.post("/conversations").send({ coachId: coachAId });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(conversationId);
    expect(res.body.counterpartId).toBe(coachAId);
    expect(res.body.counterpartName).toBe("msg-coach-a@cmv.test");
  });

  // Un coach a N athlètes : sans cible, le fil est indéterminé — pas « le premier venu ».
  it("un coach sans athlète visé ne peut pas ouvrir de fil (400)", async () => {
    const res = await coachA.post("/conversations").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("athleteId requis pour ouvrir un fil");
  });

  it("le coach ne peut pas ouvrir un fil avec l'athlète d'un autre coach (400)", async () => {
    const res = await coachA.post("/conversations").send({ athleteId: "unknown-athlete-id" });
    expect(res.status).toBe(400);
  });

  // Le symétrique côté athlète (#599) : il a 0..N coachs, et le fil se désigne, il ne se devine pas.
  it("un athlète sans coach visé ne peut pas ouvrir de fil (400)", async () => {
    const res = await athleteA1.post("/conversations").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("coachId requis pour ouvrir un fil");
  });

  it("un athlète autonome (0 coach) n'a pas de messagerie (400)", async () => {
    const res = await autonome.post("/conversations").send({ coachId: coachAId });
    expect(res.status).toBe(400);
  });

  it("le coach envoie un message texte ; l'athlète le lit dans le fil", async () => {
    const sent = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Salut, prêt pour la séance ?" });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({
      conversationId,
      senderId: coachAId,
      type: "TEXT",
      content: "Salut, prêt pour la séance ?",
      media: null,
      readAt: null,
    });

    const list = await athleteA1.get(`/conversations/${conversationId}/messages`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(sent.body.id);
  });

  it("le dernier message et le non-lu remontent dans la liste de l'athlète", async () => {
    const list = await athleteA1.get("/conversations");
    expect(list.status).toBe(200);
    const fil = list.body.find((c: { id: string }) => c.id === conversationId);
    expect(fil.lastMessageType).toBe("TEXT");
    expect(fil.lastMessagePreview).toBe("Salut, prêt pour la séance ?");
    expect(fil.lastMessageAt).not.toBeNull();
    // Message entrant non lu côté athlète.
    expect(fil.unreadCount).toBe(1);
  });

  it("l'expéditeur ne compte pas ses propres messages comme non lus", async () => {
    const list = await coachA.get("/conversations");
    const fil = list.body.find((c: { id: string }) => c.id === conversationId);
    expect(fil.unreadCount).toBe(0);
  });

  it("marquer lu remet le compteur à zéro (idempotent)", async () => {
    const read = await athleteA1.post(`/conversations/${conversationId}/read`);
    expect(read.status).toBe(204);

    const list = await athleteA1.get("/conversations");
    const fil = list.body.find((c: { id: string }) => c.id === conversationId);
    expect(fil.unreadCount).toBe(0);

    // Rien à relire une seconde fois.
    expect((await athleteA1.post(`/conversations/${conversationId}/read`)).status).toBe(204);
  });

  it("l'athlète répond ; le message est aligné sur son id d'expéditeur", async () => {
    const reply = await athleteA1
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Oui, j'arrive." });
    expect(reply.status).toBe(201);
    expect(reply.body.senderId).toBe(a1Id);

    // Réciproque : le coach a maintenant un message entrant non lu.
    const list = await coachA.get("/conversations");
    const fil = list.body.find((c: { id: string }) => c.id === conversationId);
    expect(fil.unreadCount).toBe(1);
  });

  it("un fil d'un autre tenant est invisible et inaccessible", async () => {
    // coachB ne voit pas le fil de coachA.
    expect((await coachB.get("/conversations")).body).toEqual([]);
    // Ni ses messages, ni l'envoi, ni le marquage lu (scope tenant → 404).
    expect((await coachB.get(`/conversations/${conversationId}/messages`)).status).toBe(404);
    expect(
      (
        await coachB.post(`/conversations/${conversationId}/messages`).send({
          type: "TEXT",
          content: "intrusion",
        })
      ).status,
    ).toBe(404);
    expect((await coachB.post(`/conversations/${conversationId}/read`)).status).toBe(404);
  });

  it("le pipe de validation rejette un texte vide (400)", async () => {
    const res = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "" });
    expect(res.status).toBe(400);
  });
});

describe("Messagerie : médias (P5)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let conversationId: string;

  const audio = (fileName = "note.m4a") => ({
    type: "AUDIO",
    fileName,
    mimeType: "audio/m4a",
    size: 200_000,
    durationSeconds: 12,
  });
  const image = (fileName = "photo.jpg") => ({
    type: "IMAGE",
    fileName,
    mimeType: "image/jpeg",
    size: 120_000,
  });

  // Parcours réel : URL signée → PUT direct vers le storage → envoi du message.
  async function upload(agent: Agent, input: Record<string, unknown>): Promise<string> {
    const signed = await agent
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send(input);
    expect(signed.status).toBe(201);

    // `content-length` calculé par undici depuis le corps : l'URL étant signée avec la taille
    // annoncée, l'upload ne passe que si le poids réel correspond.
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
    coachA = await signUp("msgm-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("msgm-athlete-a1@cmv.test", Role.ATHLETE);
    coachB = await signUp("msgm-coach-b@cmv.test", Role.COACH);

    const a1Id = await link(coachA, athleteA1);
    const opened = await coachA.post("/conversations").send({ athleteId: a1Id });
    conversationId = opened.body.id;
  });

  it("envoie une note vocale : URL de lecture signée, durée conservée", async () => {
    const storagePath = await upload(coachA, audio());
    const sent = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ ...audio(), storagePath });
    expect(sent.status).toBe(201);
    expect(sent.body.type).toBe("AUDIO");
    expect(sent.body.content).toBeNull();
    expect(sent.body.media).toMatchObject({
      fileName: "note.m4a",
      mimeType: "audio/m4a",
      sizeBytes: 200_000,
      durationSeconds: 12,
    });
    // Média = fichier privé : l'URL de lecture est toujours signée, jamais publique.
    expect(sent.body.media.url).toContain("X-Amz-Signature");

    const list = await athleteA1.get(`/conversations/${conversationId}/messages`);
    expect(list.body.at(-1).id).toBe(sent.body.id);
  });

  it("envoie une image : pas de durée, clé segmentée par conversation", async () => {
    const storagePath = await upload(athleteA1, image());
    expect(storagePath).toContain(`conversation/${conversationId}/`);

    const sent = await athleteA1
      .post(`/conversations/${conversationId}/messages`)
      .send({ ...image(), storagePath });
    expect(sent.status).toBe(201);
    expect(sent.body.type).toBe("IMAGE");
    expect(sent.body.media.durationSeconds).toBeNull();
  });

  // Sans la taille dans la signature, un client pourrait déclarer 200 Ko puis pousser plus lourd :
  // le plafond du schéma ne serait qu'une politesse.
  it("le storage refuse un envoi plus lourd que la taille signée", async () => {
    const signed = await coachA
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send(audio("menteuse.m4a"));
    expect(signed.status).toBe(201);

    const tooBig = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(500_000, 1),
      headers: { "content-type": "audio/m4a" },
    });
    expect(tooBig.status).not.toBe(200);
  });

  it("le schéma rejette un mime audio non supporté et une durée hors plafond (400)", async () => {
    const badMime = await coachA
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send({ ...audio(), mimeType: "audio/ogg" });
    expect(badMime.status).toBe(400);

    const tooLong = await coachA
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send({ ...audio(), durationSeconds: 301 });
    expect(tooLong.status).toBe(400);
  });

  it("un tiers ne peut pas demander d'URL d'upload sur ce fil (404)", async () => {
    const res = await coachB
      .post(`/conversations/${conversationId}/messages/upload-url`)
      .send(audio());
    expect(res.status).toBe(404);
  });

  /**
   * Envoi découpé dans un fil. Le storage lui-même est déjà couvert côté débrief : on vérifie ici
   * le CÂBLAGE propre à la messagerie — la clé segmentée par conversation, et la garde qui
   * l'oppose au chemin annoncé par le client.
   */
  describe("upload découpé", () => {
    const bigVideo = (fileName = "longue.mp4") => ({
      type: "VIDEO",
      fileName,
      mimeType: "video/mp4",
      // La plus petite vidéo qui force le découpage : un octet de plus que le seuil.
      size: MULTIPART_THRESHOLD_BYTES + 1,
      durationSeconds: 120,
    });

    async function ticketFor(input: Record<string, unknown>) {
      const signed = await athleteA1
        .post(`/conversations/${conversationId}/messages/upload-url`)
        .send(input);
      expect(signed.status).toBe(201);
      return signed.body;
    }

    it("parcours complet : parts, clôture, puis message", async () => {
      const input = bigVideo("parcours.mp4");
      const ticket = await ticketFor(input);
      expect(ticket.mode).toBe("MULTIPART");
      // La clé reste segmentée par CONVERSATION (le fichier appartient au fil, pas à un athlète).
      expect(ticket.storagePath).toContain(`conversation/${conversationId}/`);

      const sizes = multipartPartSizes(input.size) ?? [];
      for (const [index, partUrl] of (ticket.partUrls as string[]).entries()) {
        // Pas de `content-type` : `UploadPartCommand` ne le signe pas.
        const put = await fetch(partUrl, {
          method: "PUT",
          body: Buffer.alloc(sizes[index] ?? 0, 1),
        });
        expect(put.status).toBe(200);
      }

      const completed = await athleteA1
        .post(`/conversations/${conversationId}/messages/upload/complete`)
        .send({
          storagePath: ticket.storagePath,
          uploadId: ticket.uploadId,
          partCount: ticket.partUrls.length,
        });
      expect(completed.status).toBe(204);

      // L'objet recollé s'envoie comme n'importe quel média : le découpage ne se voit plus.
      const sent = await athleteA1
        .post(`/conversations/${conversationId}/messages`)
        .send({ ...input, storagePath: ticket.storagePath });
      expect(sent.status).toBe(201);
      expect(sent.body.type).toBe("VIDEO");
      expect(sent.body.media.url).toContain("X-Amz-Signature");
    });

    it("refuse un chemin de storage hors du périmètre du fil (403)", async () => {
      const ticket = await ticketFor(bigVideo("evasion.mp4"));

      const completed = await athleteA1
        .post(`/conversations/${conversationId}/messages/upload/complete`)
        .send({
          storagePath: "conversation/un-autre-fil/objet.mp4",
          uploadId: ticket.uploadId,
          partCount: 1,
        });
      expect(completed.status).toBe(403);
    });

    it("un tiers ne clôt ni n'abandonne l'upload de ce fil (404)", async () => {
      const ticket = await ticketFor(bigVideo("convoitee.mp4"));
      const payload = {
        storagePath: ticket.storagePath,
        uploadId: ticket.uploadId,
        partCount: 1,
      };

      // 404 et non 403 : le fil lui-même n'existe pas pour coachB.
      expect(
        (
          await coachB
            .post(`/conversations/${conversationId}/messages/upload/complete`)
            .send(payload)
        ).status,
      ).toBe(404);
      expect(
        (
          await coachB.post(`/conversations/${conversationId}/messages/upload/abort`).send({
            storagePath: ticket.storagePath,
            uploadId: ticket.uploadId,
          })
        ).status,
      ).toBe(404);
    });

    // Même contrat que côté débrief : abandonner purge les parts, et rien ne se recolle ensuite.
    it("l'abandon par une partie du fil purge les parts, et la clôture répond alors 404", async () => {
      const input = bigVideo("renoncee.mp4");
      const ticket = await ticketFor(input);
      const sizes = multipartPartSizes(input.size) ?? [];
      const firstPart = await fetch(ticket.partUrls[0], {
        method: "PUT",
        body: Buffer.alloc(sizes[0] ?? 0, 1),
      });
      expect(firstPart.status).toBe(200);

      const aborted = await athleteA1
        .post(`/conversations/${conversationId}/messages/upload/abort`)
        .send({ storagePath: ticket.storagePath, uploadId: ticket.uploadId });
      expect(aborted.status).toBe(204);

      const completed = await athleteA1
        .post(`/conversations/${conversationId}/messages/upload/complete`)
        .send({ storagePath: ticket.storagePath, uploadId: ticket.uploadId, partCount: 1 });
      expect(completed.status).toBe(404);
    });
  });
});

describe("Messagerie : rattachement séance / débrief (P5)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let athleteA2: Agent;
  let conversationId: string;
  let sessionA1Id: string;
  let sessionA2Id: string;
  let draftSessionId: string;
  let feedbackA1Id: string;
  let feedbackA2Id: string;

  const monday = mondayOfCurrentWeek();

  // Crée un plan (publié ou non) avec une séance, renvoie l'id de la séance.
  async function sessionInPlan(
    athleteId: string,
    title: string,
    publish: boolean,
  ): Promise<string> {
    const plan = await coachA.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await coachA
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title, scheduledDate: monday });
    if (publish) {
      await billAndPublish(coachA, plan.body.id);
    }
    return session.body.id;
  }

  async function debrief(athlete: Agent, sessionId: string): Promise<string> {
    const res = await athlete
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Retour" });
    expect(res.status).toBe(200);
    return res.body.id;
  }

  beforeAll(async () => {
    coachA = await signUp("msga-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("msga-athlete-a1@cmv.test", Role.ATHLETE);
    athleteA2 = await signUp("msga-athlete-a2@cmv.test", Role.ATHLETE);

    const a1Id = await link(coachA, athleteA1);
    const a2Id = await link(coachA, athleteA2);

    sessionA1Id = await sessionInPlan(a1Id, "Séance A1", true);
    sessionA2Id = await sessionInPlan(a2Id, "Séance A2", true);
    draftSessionId = await sessionInPlan(a1Id, "Séance brouillon A1", false);
    feedbackA1Id = await debrief(athleteA1, sessionA1Id);
    feedbackA2Id = await debrief(athleteA2, sessionA2Id);

    const opened = await coachA.post("/conversations").send({ athleteId: a1Id });
    conversationId = opened.body.id;
  });

  it("l'athlète rattache une séance publiée à son message", async () => {
    const res = await athleteA1
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "À propos de cette séance", scheduledSessionId: sessionA1Id });
    expect(res.status).toBe(201);
    expect(res.body.scheduledSessionId).toBe(sessionA1Id);
  });

  it("le coach rattache la même séance", async () => {
    const res = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Bien vu", scheduledSessionId: sessionA1Id });
    expect(res.status).toBe(201);
    expect(res.body.scheduledSessionId).toBe(sessionA1Id);
  });

  // Le scope tenant ne filtre PAS le statut : sans la garde du service, l'athlète rattacherait
  // une séance d'un cycle encore en brouillon.
  it("refuse le rattachement d'une séance non diffusée (côté athlète)", async () => {
    const res = await athleteA1
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Trop tôt", scheduledSessionId: draftSessionId });
    expect(res.status).toBe(404);
  });

  // Le coach a N athlètes : sa séance d'un AUTRE athlète n'a rien à faire dans ce fil.
  it("refuse une séance d'un autre athlète du même coach (400)", async () => {
    const res = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Mauvais fil", scheduledSessionId: sessionA2Id });
    expect(res.status).toBe(400);
  });

  it("refuse une séance inconnue (400)", async () => {
    const res = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "?", scheduledSessionId: "nope" });
    expect(res.status).toBe(400);
  });

  it("rattache un débrief du fil, mais pas celui d'un autre athlète", async () => {
    const ok = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "J'ai lu ton débrief", sessionFeedbackId: feedbackA1Id });
    expect(ok.status).toBe(201);
    expect(ok.body.sessionFeedbackId).toBe(feedbackA1Id);

    const cross = await coachA
      .post(`/conversations/${conversationId}/messages`)
      .send({ type: "TEXT", content: "Mauvais débrief", sessionFeedbackId: feedbackA2Id });
    expect(cross.status).toBe(400);
  });
});

/**
 * Répondre à un débrief ouvre une LECTURE neuve qui traverse la frontière tenant : les messages
 * rattachés remontent maintenant dans le débrief lui-même, par un second chemin que la messagerie.
 * Toute route neuve a son e2e d'isolation.
 *
 * Ce que l'ÉCRITURE refuse est déjà couvert par « Messagerie : rattachement séance / débrief » —
 * on ne le réécrit pas. Ce qui manque, et qui est ici : la lecture, et la dérivation de
 * « répondu ».
 */
describe("Réponses à un débrief : lecture, isolation et « répondu » (#196)", () => {
  let coachA: Agent;
  let athleteA1: Agent;
  let coachB: Agent;
  let athleteB1: Agent;
  let sessionA1Id: string;
  let sessionB1Id: string;
  let feedbackA1Id: string;
  let feedbackA1bisId: string;
  let feedbackB1Id: string;
  let conversationAId: string;

  const monday = mondayOfCurrentWeek();

  const byId = (feedbacks: { id: string; repliedAt: string | null }[], id: string) =>
    required(
      feedbacks.find((feedback) => feedback.id === id),
      `débrief ${id} absent de la liste du coach`,
    );

  // Un cycle diffusé avec une séance, débriefé par son athlète. Renvoie séance et débrief.
  async function debriefedSession(
    coach: Agent,
    athlete: Agent,
    athleteId: string,
    title: string,
  ): Promise<{ sessionId: string; feedbackId: string }> {
    const plan = await coach
      .post("/plans")
      .send({ athleteId, title, startDate: monday, weeks: [{ type: "TRAINING" }] });
    const session = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title, scheduledDate: monday });
    await billAndPublish(coach, plan.body.id);
    const feedback = await athlete
      .put(`/me/scheduled-sessions/${session.body.id}/feedback`)
      .send({ content: "Retour" });
    expect(feedback.status).toBe(200);
    return { sessionId: session.body.id, feedbackId: feedback.body.id };
  }

  beforeAll(async () => {
    coachA = await signUp("rep-coach-a@cmv.test", Role.COACH);
    athleteA1 = await signUp("rep-athlete-a1@cmv.test", Role.ATHLETE);
    coachB = await signUp("rep-coach-b@cmv.test", Role.COACH);
    athleteB1 = await signUp("rep-athlete-b1@cmv.test", Role.ATHLETE);

    const a1Id = await link(coachA, athleteA1);
    const b1Id = await link(coachB, athleteB1);

    const a = await debriefedSession(coachA, athleteA1, a1Id, "Séance A1");
    sessionA1Id = a.sessionId;
    feedbackA1Id = a.feedbackId;
    // Un SECOND débrief du même athlète : celui-ci reste vierge de réponse du coach jusqu'au test
    // de « répondu », qui a besoin d'un débrief dont l'ordre des messages est maîtrisé.
    feedbackA1bisId = (await debriefedSession(coachA, athleteA1, a1Id, "Séance A1 bis")).feedbackId;
    const b = await debriefedSession(coachB, athleteB1, b1Id, "Séance B1");
    sessionB1Id = b.sessionId;
    feedbackB1Id = b.feedbackId;

    const opened = await coachA.post("/conversations").send({ athleteId: a1Id });
    conversationAId = opened.body.id;
  });

  it("rend les messages rattachés au coach ET à l'athlète, par leurs routes respectives", async () => {
    const sent = await coachA
      .post(`/conversations/${conversationAId}/messages`)
      .send({ type: "TEXT", content: "Bien joué", sessionFeedbackId: feedbackA1Id });
    expect(sent.status).toBe(201);

    // Le coach lit le débrief de son athlète, l'athlète lit le sien : deux routes, un seul
    // enregistrement — jamais une copie.
    const coachSide = await coachA.get(`/scheduled-sessions/${sessionA1Id}/feedback`);
    const athleteSide = await athleteA1.get(`/me/scheduled-sessions/${sessionA1Id}/feedback`);
    expect(coachSide.body.messages.map((m: { id: string }) => m.id)).toEqual([sent.body.id]);
    expect(athleteSide.body.messages.map((m: { id: string }) => m.id)).toEqual([sent.body.id]);
  });

  /**
   * Le libellé du rattachement est résolu par une requête SCOPÉE, jamais par un `include` — un
   * include imbriqué échappe au scope tenant et ferait remonter la cible sans filtre. Ici la cible
   * est dans la relation, donc le libellé EST rendu : c'est ce qui prouve que le test suivant
   * mesure une fermeture, et non une résolution cassée pour tout le monde.
   */
  it("résout le libellé du rattachement pour qui a le droit de lire la cible", async () => {
    const thread = await coachA.get(`/conversations/${conversationAId}/messages`);
    const attached = thread.body.find(
      (m: { sessionFeedbackId: string | null }) => m.sessionFeedbackId === feedbackA1Id,
    );
    expect(attached.attachment).toMatchObject({
      type: "SESSION_FEEDBACK",
      id: feedbackA1Id,
      scheduledSessionId: sessionA1Id,
      sessionTitle: "Séance A1",
    });
  });

  it("un coach ne lit pas le débrief — ni ses réponses — d'un athlète qui n'est pas le sien", async () => {
    // `null` et non 404 : l'absence de débrief est un état normal de cette route. Ce qui compte
    // est qu'aucune charge utile ne sorte, donc aucun message rattaché.
    const res = await coachB.get(`/scheduled-sessions/${sessionA1Id}/feedback`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  /**
   * `200` + `null`, et non 404 : la route rend déjà `null` sur une séance jamais débriefée, et
   * c'est exactement ce qu'on veut ici. Un athlète ne peut PAS distinguer « le débrief d'un autre »
   * de « pas encore débriefé » — un 404 lui apprendrait que la séance existe.
   */
  it("un athlète ne distingue pas le débrief d'un autre d'une séance jamais débriefée", async () => {
    const res = await athleteB1.get(`/me/scheduled-sessions/${sessionA1Id}/feedback`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  /**
   * « Répondu » ne compte QUE les messages du coach. Un athlète qui écrit sur son propre débrief
   * ne le marque pas traité — sinon la boîte de réception dirait « répondu » sur ce que le coach
   * n'a pas encore lu.
   *
   * L'ordre compte, et c'est tout l'objet du test : l'athlète écrit EN PREMIER. L'inverse
   * laisserait passer une implémentation qui retient simplement le message le plus ancien.
   */
  it("« répondu » ignore un message de l'athlète et retient le premier du coach", async () => {
    const athleteFirst = await athleteA1
      .post(`/conversations/${conversationAId}/messages`)
      .send({ type: "TEXT", content: "Une précision", sessionFeedbackId: feedbackA1bisId });
    expect(athleteFirst.status).toBe(201);

    const afterAthlete = await coachA.get("/feedbacks");
    expect(byId(afterAthlete.body, feedbackA1bisId).repliedAt).toBeNull();

    const coachReply = await coachA
      .post(`/conversations/${conversationAId}/messages`)
      .send({ type: "TEXT", content: "Reçu", sessionFeedbackId: feedbackA1bisId });
    expect(coachReply.status).toBe(201);

    const afterCoach = await coachA.get("/feedbacks");
    // La date est celle du message du COACH, pas celle du premier message du fil.
    expect(byId(afterCoach.body, feedbackA1bisId).repliedAt).toBe(coachReply.body.createdAt);

    // Et c'est la PREMIÈRE réponse du coach : une relance ne redate pas « répondu ».
    const followUp = await coachA
      .post(`/conversations/${conversationAId}/messages`)
      .send({ type: "TEXT", content: "Tu me redis ?", sessionFeedbackId: feedbackA1bisId });
    expect(followUp.status).toBe(201);
    const afterFollowUp = await coachA.get("/feedbacks");
    expect(byId(afterFollowUp.body, feedbackA1bisId).repliedAt).toBe(coachReply.body.createdAt);
  });

  /**
   * Le refus d'un rattachement hors relation ne doit rien laisser derrière lui : ni message
   * orphelin de son contexte, ni entrée dans le fil. C'est le seul point de l'écriture que le
   * describe « rattachement » ne vérifiait pas.
   */
  it("refuse un débrief d'une AUTRE relation, sans rien écrire", async () => {
    const before = await coachA.get(`/conversations/${conversationAId}/messages`);

    const refused = await coachA
      .post(`/conversations/${conversationAId}/messages`)
      .send({ type: "TEXT", content: "Chez le voisin", sessionFeedbackId: feedbackB1Id });
    expect(refused.status).toBe(400);

    const after = await coachA.get(`/conversations/${conversationAId}/messages`);
    expect(after.body.length).toBe(before.body.length);
  });

  it("le débrief jamais répondu n'a ni réponse ni date", async () => {
    const feedbacks = await coachB.get("/feedbacks");
    const untouched = feedbacks.body.find((f: { id: string }) => f.id === feedbackB1Id);
    expect(untouched.repliedAt).toBeNull();
    expect((await coachB.get(`/scheduled-sessions/${sessionB1Id}/feedback`)).body.messages).toEqual(
      [],
    );
  });
});
