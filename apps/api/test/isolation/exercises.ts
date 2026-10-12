import { Role, STALE_WRITE } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, required, signUp } from "../support/actors";
import {
  type DocumentFile,
  jpeg,
  putExerciseFile,
  uploadInstructionImage,
} from "../support/fixtures";
import { versionOf } from "../support/version";

describe("Isolation bibliothèque d'exercices (P2)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athlete: Agent;
  let exerciseAId: string;

  beforeAll(async () => {
    coachA = await signUp("ex-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("ex-coach-b@cmv.test", Role.COACH);
    athlete = await signUp("ex-athlete@cmv.test", Role.ATHLETE);

    const created = await coachA.post("/exercises").send({
      title: "Gainage dynamique",
      description: "4×45 s",
      tags: ["Gainage", "renfo"],
    });
    expect(created.status).toBe(201);
    exerciseAId = created.body.id;
    expect(typeof created.body.coachId).toBe("string");
    expect(created.body.documents).toEqual([]);
    expect(created.body.tags).toEqual(["gainage", "renfo"]);

    const decoy = await coachB.post("/exercises").send({
      title: "Traction",
      tags: ["poulie"],
    });
    expect(decoy.status).toBe(201);
  });

  it("un coach ne voit que SES tags", async () => {
    const own = await coachA.get("/exercises/tags");
    expect(own.status).toBe(200);
    expect(own.body).toEqual(["gainage", "renfo"]);

    const other = await coachB.get("/exercises/tags");
    expect(other.body).toEqual(["poulie"]);
  });

  it("le filtre par tag ne franchit pas la frontière du coach", async () => {
    const own = await coachA.get("/exercises").query({ tag: "Gainage" });
    expect(own.body).toHaveLength(1);
    expect(own.body[0].id).toBe(exerciseAId);

    // Le tag existe, mais chez l'autre coach : la liste doit rester vide, pas fuir l'exercice.
    const other = await coachB.get("/exercises").query({ tag: "gainage" });
    expect(other.body).toHaveLength(0);
  });

  it("un coach ne liste que SES exercices", async () => {
    const own = await coachA.get("/exercises");
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0].id).toBe(exerciseAId);

    // coachB a le sien : la liste n'est pas vide, elle est simplement disjointe.
    const other = await coachB.get("/exercises");
    expect(other.body.map((e: { id: string }) => e.id)).not.toContain(exerciseAId);
  });

  /**
   * La recherche par titre est insensible aux accents (#141), et le reste APRÈS un renommage.
   * Ce second point est le seul que rien d'autre ne protège : `titleSearch` est écrite sous la
   * même garde que `title`, et si elles divergeaient, l'exercice deviendrait introuvable par
   * l'ancien mot comme par le nouveau — sans erreur, sans log, sans rien à l'écran.
   */
  it("trouve un titre accentué sans l'accent, et suit le renommage", async () => {
    const created = await coachA.post("/exercises").send({ title: "Échauffement — dévers" });
    expect(created.status).toBe(201);
    const id: string = created.body.id;

    const idsFound = async (agent: Agent, search: string) => {
      const res = await agent.get("/exercises").query({ search });
      expect(res.status).toBe(200);
      return res.body.map((exercise: { id: string }) => exercise.id);
    };

    // Les quatre façons de le taper ramènent la même ligne — c'est le défaut de l'issue.
    for (const typed of ["echauffement", "Échauffement", "DEVERS", "dévers"]) {
      expect(await idsFound(coachA, typed)).toContain(id);
    }

    // Et le scope tenant s'applique toujours : la recherche ne le fait pas sauter.
    expect(await idsFound(coachB, "echauffement")).toHaveLength(0);

    const renamed = await coachA.patch(`/exercises/${id}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${id}`),
      title: "Gainage postural",
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.title).toBe("Gainage postural");

    // La forme comparable a suivi : l'ancien mot ne ramène plus rien, le nouveau ramène la ligne.
    expect(await idsFound(coachA, "echauffement")).toHaveLength(0);
    expect(await idsFound(coachA, "POSTURAL")).toContain(id);
  });

  /**
   * Les tags d'un exercice se REMPLACENT (replace-all) : les envoyer redéfinit la liste, les omettre
   * n'y touche pas, `[]` la vide. Un vidage qui laisserait l'ancienne liste en place ferait mentir
   * le filtre par tag — l'exercice resterait trouvé par un mot que le coach a retiré.
   */
  it("remplace, garde ou vide les tags selon ce que la modification envoie", async () => {
    const created = await coachA
      .post("/exercises")
      .send({ title: "Poutre à doigts", tags: ["doigts", "force"] });
    const id: string = created.body.id;

    const retagged = await coachA.patch(`/exercises/${id}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${id}`),
      description: "Réglette 15 mm",
      tags: ["Poutre"],
    });
    expect(retagged.status).toBe(200);
    expect(retagged.body).toMatchObject({ description: "Réglette 15 mm", tags: ["poutre"] });

    // Sans `tags`, la liste reste celle d'avant — un renommage ne doit pas détagguer l'exercice.
    const renamed = await coachA
      .patch(`/exercises/${id}`)
      .send({ expectedUpdatedAt: await versionOf(coachA, `/exercises/${id}`), description: null });
    expect(renamed.body).toMatchObject({ description: null, tags: ["poutre"] });

    const cleared = await coachA
      .patch(`/exercises/${id}`)
      .send({ expectedUpdatedAt: await versionOf(coachA, `/exercises/${id}`), tags: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.tags).toEqual([]);
    // Le tag ne vit plus nulle part : ni dans la liste du coach, ni dans le filtre.
    expect((await coachA.get("/exercises/tags")).body).not.toContain("poutre");
    expect((await coachA.get("/exercises").query({ tag: "poutre" })).body).toEqual([]);

    await coachA.delete(`/exercises/${id}`);
  });

  it("compte les séances MODÈLES qui référencent l'exercice, pas les copies diffusées", async () => {
    const fresh = await coachA.post("/exercises").send({ title: "Gainage latéral" });
    expect(fresh.body.usedInSessionCount).toBe(0);

    const session = await coachA.post("/sessions").send({
      title: "Circuit court",
      exercises: [{ exerciseId: fresh.body.id, note: "3×30 s" }],
    });
    expect(session.status).toBe(201);

    const used = await coachA.get(`/exercises/${fresh.body.id}`);
    expect(used.body.usedInSessionCount).toBe(1);

    // Retirer l'exercice de la séance le fait redescendre : le compte est lu, jamais stocké.
    await coachA.put(`/sessions/${session.body.id}`).send({
      expectedUpdatedAt: session.body.updatedAt,
      title: "Circuit court",
      exercises: [],
    });
    expect((await coachA.get(`/exercises/${fresh.body.id}`)).body.usedInSessionCount).toBe(0);

    await coachA.delete(`/sessions/${session.body.id}`);
    await coachA.delete(`/exercises/${fresh.body.id}`);
  });

  it("un coach ne peut PAS lire l'exercice d'un autre coach", async () => {
    const res = await coachB.get(`/exercises/${exerciseAId}`);
    expect(res.status).toBe(404);
  });

  it("consigne structurée et blocs font l'aller-retour sans perte", async () => {
    const instructions = [
      { type: "HEADING", content: [{ text: "Mise en place" }] },
      { type: "PARAGRAPH", content: [{ text: "Coudes ", marks: ["BOLD"] }, { text: "serrés." }] },
    ];
    const blocks = [
      {
        id: "blk_1",
        label: "Travail",
        structure: { type: "SERIES", setCount: 4, restBetweenSetsSeconds: 150 },
        metrics: [
          {
            id: "col_reps",
            source: "CATALOG",
            key: "REPETITIONS",
            unit: "REPS",
            label: null,
            collapsed: false,
          },
        ],
        rows: [{ id: "r1", values: { col_reps: 6 } }],
      },
    ];

    const created = await coachA
      .post("/exercises")
      .send({ title: "Tractions lestées", instructions, blocks });
    expect(created.status).toBe(201);

    // Relecture : le JSON ne doit ni se réordonner ni perdre ses marques d'inline.
    const read = await coachA.get(`/exercises/${created.body.id}`);
    expect(read.body.instructions).toEqual(instructions);
    expect(read.body.blocks).toEqual(blocks);
  });

  it("refuse un bloc dont la structure ne tient pas", async () => {
    // EMOM dont la durée totale ne couvre pas un intervalle : refusé par exerciseBlockSchema,
    // donc 400 — jamais écrit en base, où plus rien ne le rattraperait.
    const res = await coachA.post("/exercises").send({
      title: "EMOM impossible",
      blocks: [
        {
          id: "blk_1",
          label: null,
          structure: { type: "EMOM", intervalSeconds: 60, totalDurationSeconds: 30 },
          metrics: [
            {
              id: "c1",
              source: "CATALOG",
              key: "REPETITIONS",
              unit: "REPS",
              label: null,
              collapsed: false,
            },
          ],
          rows: [],
        },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("un coach ne peut PAS modifier ni supprimer l'exercice d'un autre coach", async () => {
    const patch = await coachB.patch(`/exercises/${exerciseAId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${exerciseAId}`),
      title: "intrusion",
    });
    expect(patch.status).toBe(404);
    const del = await coachB.delete(`/exercises/${exerciseAId}`);
    expect(del.status).toBe(404);
    const still = await coachA.get(`/exercises/${exerciseAId}`);
    expect(still.body.title).toBe("Gainage dynamique");
  });

  it("un athlète n'a aucun accès à la bibliothèque (route coach)", async () => {
    expect((await athlete.get("/exercises")).status).toBe(403);
    expect((await athlete.post("/exercises").send({ title: "x" })).status).toBe(403);
  });

  it("attache un document LINK, visible dans le détail de l'exercice", async () => {
    const attached = await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://youtu.be/demo" });
    expect(attached.status).toBe(201);
    expect(attached.body.type).toBe("LINK");
    expect(attached.body.url).toBe("https://youtu.be/demo");
    expect(attached.body.fileName).toBeNull();

    const detail = await coachA.get(`/exercises/${exerciseAId}`);
    expect(detail.body.documents).toHaveLength(1);
    expect(detail.body.documents[0].id).toBe(attached.body.id);
  });

  it("distingue l'image de consigne de la pièce jointe", async () => {
    const link = await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://exemple.test/fiche" });
    // Un LINK est toujours une pièce jointe : le lien inline de la consigne est une MARQUE sur du
    // texte, pas un document rattaché.
    expect(link.body.usage).toBe("ATTACHMENT");

    const file = jpeg("position-basse.jpg");
    const image = await coachA.post(`/exercises/${exerciseAId}/documents`).send({
      type: "FILE",
      storagePath: await putExerciseFile(coachA, exerciseAId, file),
      ...file,
      usage: "INSTRUCTION",
    });
    expect(image.status).toBe(201);
    expect(image.body.usage).toBe("INSTRUCTION");

    await coachA.delete(`/exercises/${exerciseAId}/documents/${link.body.id}`);
    await coachA.delete(`/exercises/${exerciseAId}/documents/${image.body.id}`);
  });

  it("refuse un PDF comme image de consigne", async () => {
    // Le PDF reste une pièce jointe légitime, mais il n'a aucun rendu inline dans un document —
    // ni sur le web ni en React Native.
    const upload = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "fiche.pdf", mimeType: "application/pdf", size: 2048 });
    const res = await coachA.post(`/exercises/${exerciseAId}/documents`).send({
      type: "FILE",
      storagePath: upload.body.storagePath,
      fileName: "fiche.pdf",
      mimeType: "application/pdf",
      size: 2048,
      usage: "INSTRUCTION",
    });
    expect(res.status).toBe(400);
  });

  it("un coach ne peut PAS agir sur les documents de l'exercice d'un autre coach", async () => {
    const attach = await coachB
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://x.test" });
    expect(attach.status).toBe(404);

    const uploadUrl = await coachB
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "a.pdf", mimeType: "application/pdf", size: 1000 });
    expect(uploadUrl.status).toBe(404);

    /**
     * La suppression ne relit PAS l'exercice avant le document : seul le scope tenant sur
     * `ExerciseDocument` la garde. D'où les deux angles — le document d'un autre coach, et celui
     * d'un AUTRE exercice du même coach cité sous le mauvais parent.
     */
    const doc = await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://a.test/video" });
    const sibling = await coachA.post("/exercises").send({ title: "Voisin" });
    const docsOfA = async () =>
      ((await coachA.get(`/exercises/${exerciseAId}`)).body.documents as { id: string }[]).map(
        (d) => d.id,
      );

    const foreign = await coachB.delete(`/exercises/${exerciseAId}/documents/${doc.body.id}`);
    const wrongParent = await coachA.delete(
      `/exercises/${sibling.body.id}/documents/${doc.body.id}`,
    );
    expect([foreign.status, wrongParent.status]).toEqual([404, 404]);
    expect(wrongParent.body.message).toBe("Document introuvable");
    expect(await docsOfA()).toContain(doc.body.id);

    await coachA.delete(`/exercises/${exerciseAId}/documents/${doc.body.id}`);
    await coachA.delete(`/exercises/${sibling.body.id}`);
    expect(await docsOfA()).not.toContain(doc.body.id);
  });

  // Le fail-closed « storage non configuré → 503 » est couvert par le test unitaire de
  // StorageService : les e2e tournent désormais avec le SILO du docker-compose, sans quoi le
  // flux médias de P4 (upload signé → rattachement → purge) ne serait pas testable.
  it("URL d'upload : signée sur le bucket privé", async () => {
    const res = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "demo.pdf", mimeType: "application/pdf", size: 1000 });
    expect(res.status).toBe(201);
    expect(res.body.uploadUrl).toContain("X-Amz-Signature");
    expect(res.body.storagePath).toContain(`/exercises/${exerciseAId}/`);
  });

  it("URL d'upload : type MIME et taille validés par le schéma partagé (400)", async () => {
    // Contraintes portées par requestUploadUrlSchema (@cmv/shared) → rejet AVANT le service.
    const badType = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "x.exe", mimeType: "application/x-msdownload", size: 1000 });
    expect(badType.status).toBe(400);

    const tooBig = await coachA
      .post(`/exercises/${exerciseAId}/documents/upload-url`)
      .send({ fileName: "gros.pdf", mimeType: "application/pdf", size: 50 * 1024 * 1024 });
    expect(tooBig.status).toBe(400);
  });

  // Sans la taille dans la signature, un coach déclarait 1 Ko puis poussait ce qu'il voulait — et
  // le mobile de l'athlète télécharge ces documents d'office (#95, #317).
  it("le storage refuse un envoi plus lourd que la taille signée", async () => {
    const file = jpeg("menteuse.jpg");
    const signed = await coachA.post(`/exercises/${exerciseAId}/documents/upload-url`).send(file);
    expect(signed.status).toBe(201);

    const tooBig = await fetch(signed.body.uploadUrl, {
      method: "PUT",
      body: Buffer.alloc(file.size * 2, 1),
      headers: { "content-type": file.mimeType },
    });
    expect(tooBig.ok).toBe(false);
  });

  // Signée mais jamais envoyée : la ligne désignerait un objet absent, que le mobile de l'athlète
  // chercherait en vain à télécharger.
  it("refuse de rattacher une clé où rien n'a été envoyé (404)", async () => {
    const file = jpeg("fantome.jpg");
    const signed = await coachA.post(`/exercises/${exerciseAId}/documents/upload-url`).send(file);

    const res = await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "FILE", storagePath: signed.body.storagePath, ...file });
    expect(res.status).toBe(404);
  });

  // Le rattachement redit le ticket ; le storage, qui a reçu l'objet, tranche.
  it("refuse un rattachement qui ne redit pas le type ou la taille de l'objet reçu (409)", async () => {
    const file = jpeg("redite.jpg");
    const storagePath = await putExerciseFile(coachA, exerciseAId, file);
    const attach = (declared: Partial<DocumentFile>) =>
      coachA
        .post(`/exercises/${exerciseAId}/documents`)
        .send({ type: "FILE", storagePath, ...file, ...declared });

    expect((await attach({ size: 1 })).status).toBe(409);
    expect((await attach({ mimeType: "image/png" })).status).toBe(409);
    // L'objet reste rattachable tel qu'il a été envoyé : le refus ne l'a pas consommé.
    const honest = await attach({});
    expect(honest.status).toBe(201);
    await coachA.delete(`/exercises/${exerciseAId}/documents/${honest.body.id}`);
  });

  it("le pipe de validation global est actif (titre vide, champ inconnu → 400)", async () => {
    expect((await coachA.post("/exercises").send({ title: "" })).status).toBe(400);
    // `category` a disparu du contrat en #163 : le schéma est strict, l'envoyer encore est un 400.
    expect((await coachA.post("/exercises").send({ title: "x", category: "RENFO" })).status).toBe(
      400,
    );
  });

  it("un refus de validation sort en français, sans écraser les messages écrits (#319)", async () => {
    const tooLong = await coachA.post("/exercises").send({ title: "x".repeat(201) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toEqual([
      { path: "title", message: "Ce texte dépasse 200 caractères." },
    ]);

    const empty = await coachA.post("/exercises").send({ title: "" });
    expect(empty.body.message).toEqual([{ path: "title", message: "Ce champ est requis." }]);

    // Le message écrit par le schéma garde la main sur la table de l'API.
    const duplicateTag = await coachA.post("/exercises").send({ title: "x", tags: ["a", "a"] });
    expect(duplicateTag.status).toBe(400);
    expect(duplicateTag.body.message[0].message).toBe(
      "Un exercice ne peut pas porter deux fois le même tag.",
    );
  });
});

describe("Images de consigne : possédées, et recopiées en variante (#315)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let sourceId: string;
  let imageId: string;
  let attachmentId: string;

  const paragraph = { type: "PARAGRAPH", content: [{ text: "Prise large." }] };
  const documentsOf = async (exerciseId: string) =>
    (await coachA.get(`/exercises/${exerciseId}`)).body.documents as {
      id: string;
      usage: string;
      url: string;
    }[];

  beforeAll(async () => {
    coachA = await signUp("variant-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("variant-coach-b@cmv.test", Role.COACH);

    const source = await coachA.post("/exercises").send({
      title: "Tractions",
      description: "Lestées",
      tags: ["force"],
      blocks: [],
    });
    expect(source.status).toBe(201);
    sourceId = source.body.id;
    imageId = await uploadInstructionImage(coachA, sourceId);
    const attachment = await coachA
      .post(`/exercises/${sourceId}/documents`)
      .send({ type: "LINK", url: "https://exemple.test/demo" });
    attachmentId = attachment.body.id;
    const withImage = await coachA.patch(`/exercises/${sourceId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${sourceId}`),
      instructions: [paragraph, { type: "IMAGE", mediaId: imageId, width: "SMALL" }],
    });
    expect(withImage.status).toBe(200);
  });

  it("la variante cite SES images de consigne, et laisse les pièces jointes à la source", async () => {
    const variant = await coachA
      .post(`/exercises/${sourceId}/duplicate`)
      .send({ title: "Tractions (variante)" });
    expect(variant.status).toBe(201);
    expect(variant.body.title).toBe("Tractions (variante)");
    expect(variant.body.description).toBe("Lestées");
    expect(variant.body.tags).toEqual(["force"]);

    const [copy] = variant.body.documents;
    expect(variant.body.documents).toHaveLength(1);
    expect(copy.id).not.toBe(imageId);
    expect(copy.usage).toBe("INSTRUCTION");
    expect(variant.body.instructions).toEqual([
      paragraph,
      { type: "IMAGE", mediaId: copy.id, width: "SMALL" },
    ]);
    expect((await documentsOf(sourceId)).map((d) => d.id)).toEqual(
      expect.arrayContaining([imageId, attachmentId]),
    );
  });

  it("grave le dosage reçu plutôt que celui de la source", async () => {
    const blocks = [
      {
        id: "blk_1",
        label: "Travail",
        structure: { type: "SERIES", setCount: 4, restBetweenSetsSeconds: 150 },
        metrics: [
          {
            id: "col_reps",
            source: "CATALOG",
            key: "REPETITIONS",
            unit: "REPS",
            label: null,
            collapsed: false,
          },
        ],
        rows: [{ id: "r1", values: { col_reps: 6 } }],
      },
    ];
    const variant = await coachA
      .post(`/exercises/${sourceId}/duplicate`)
      .send({ title: "Tractions ×6", blocks });
    expect(variant.status).toBe(201);
    expect(variant.body.blocks).toEqual(blocks);
  });

  it("supprimer la source garde l'image que la variante affiche", async () => {
    const source = await coachA.post("/exercises").send({ title: "Dips" });
    const image = await uploadInstructionImage(coachA, source.body.id);
    await coachA.patch(`/exercises/${source.body.id}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${source.body.id}`),
      instructions: [{ type: "IMAGE", mediaId: image }],
    });
    const variant = await coachA
      .post(`/exercises/${source.body.id}/duplicate`)
      .send({ title: "Dips (variante)" });

    expect((await coachA.delete(`/exercises/${source.body.id}`)).status).toBe(204);

    const [copy] = await documentsOf(variant.body.id);
    expect((await fetch(required(copy, "image de la variante").url)).status).toBe(200);

    // La dernière ligne qui porte la clé part : l'objet part avec elle.
    expect((await coachA.delete(`/exercises/${variant.body.id}`)).status).toBe(204);
    expect((await fetch(required(copy, "image de la variante").url)).status).toBe(404);
  });

  it("un coach ne duplique PAS l'exercice d'un autre coach", async () => {
    const res = await coachB.post(`/exercises/${sourceId}/duplicate`).send({ title: "Volée" });
    expect(res.status).toBe(404);
  });

  it("refuse à la création une consigne qui cite une image (400) : l'exercice n'en a aucune", async () => {
    const res = await coachA
      .post("/exercises")
      .send({ title: "Copie à la main", instructions: [{ type: "IMAGE", mediaId: imageId }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("La consigne cite une image qui n'appartient pas à cet exercice");
  });

  it.each([
    ["l'image d'un autre exercice du coach", async () => imageId],
    [
      "une pièce jointe de l'exercice lui-même",
      async (targetId: string) =>
        (
          await coachA
            .post(`/exercises/${targetId}/documents`)
            .send({ type: "LINK", url: "https://exemple.test/cible" })
        ).body.id as string,
    ],
  ])("refuse à la modification %s (400), sans rien écrire", async (_label, citedOf) => {
    const target = await coachA.post("/exercises").send({ title: "Cible" });
    const cited = await citedOf(target.body.id);

    const res = await coachA.patch(`/exercises/${target.body.id}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${target.body.id}`),
      title: "Cible renommée",
      instructions: [paragraph, { type: "IMAGE", mediaId: cited }],
    });
    expect(res.status).toBe(400);

    const after = await coachA.get(`/exercises/${target.body.id}`);
    expect(after.body.title).toBe("Cible");
    expect(after.body.instructions).toBeNull();
  });

  it("refuse l'image d'un autre coach (400)", async () => {
    const own = await coachB.post("/exercises").send({ title: "Chez B" });
    const res = await coachB.patch(`/exercises/${own.body.id}`).send({
      expectedUpdatedAt: await versionOf(coachB, `/exercises/${own.body.id}`),
      instructions: [{ type: "IMAGE", mediaId: imageId }],
    });
    expect(res.status).toBe(400);
  });

  it("refuse une consigne fournie par le client : elle vient de la source", async () => {
    const res = await coachA
      .post(`/exercises/${sourceId}/duplicate`)
      .send({ title: "x", instructions: [{ type: "IMAGE", mediaId: imageId }] });
    expect(res.status).toBe(400);
  });
});

describe("Métriques maison du coach (#162)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let metricAId: string;

  beforeAll(async () => {
    coachA = await signUp("metric-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("metric-coach-b@cmv.test", Role.COACH);

    const created = await coachA.post("/custom-metrics").send({
      label: "Cotation maison",
      unit: null,
      valueType: "SCALE",
      scale: ["facile", "moyen", "dur"],
    });
    expect(created.status).toBe(201);
    metricAId = created.body.id;
    expect(created.body.scale).toEqual(["facile", "moyen", "dur"]);
  });

  it("un coach ne liste que SES métriques", async () => {
    const own = await coachA.get("/custom-metrics");
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0].label).toBe("Cotation maison");

    expect((await coachB.get("/custom-metrics")).body).toHaveLength(0);
  });

  it("un coach ne peut ni modifier ni supprimer la métrique d'un autre", async () => {
    const patch = await coachB.patch(`/custom-metrics/${metricAId}`).send({
      label: "Intrusion",
      unit: null,
      valueType: "NUMBER",
      scale: null,
    });
    expect(patch.status).toBe(404);
    expect((await coachB.delete(`/custom-metrics/${metricAId}`)).status).toBe(404);
  });

  it("refuse deux métriques de même nom chez le MÊME coach, pas entre coachs", async () => {
    const duplicate = await coachA
      .post("/custom-metrics")
      .send({ label: "Cotation maison", unit: null, valueType: "NUMBER", scale: null });
    expect(duplicate.status).toBe(409);

    // Le même libellé chez un AUTRE coach est légitime : l'unicité est par tenant.
    const elsewhere = await coachB
      .post("/custom-metrics")
      .send({ label: "Cotation maison", unit: null, valueType: "NUMBER", scale: null });
    expect(elsewhere.status).toBe(201);
    await coachB.delete(`/custom-metrics/${elsewhere.body.id}`);
  });

  it("tient l'invariant type/paliers dans les deux sens", async () => {
    // SCALE sans paliers : aucune saisie ne serait possible.
    const noSteps = await coachA
      .post("/custom-metrics")
      .send({ label: "Sans paliers", unit: null, valueType: "SCALE", scale: null });
    expect(noSteps.status).toBe(400);

    // Paliers sur un type qui n'en veut pas : donnée morte, et un rendu qui ne saurait qu'en faire.
    const strayScale = await coachA
      .post("/custom-metrics")
      .send({ label: "Nombre paliers", unit: "pts", valueType: "NUMBER", scale: ["a", "b"] });
    expect(strayScale.status).toBe(400);
  });

  it("la mise à jour REMPLACE la définition", async () => {
    const res = await coachA
      .patch(`/custom-metrics/${metricAId}`)
      .send({ label: "Indice technique", unit: "pts", valueType: "NUMBER", scale: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: metricAId,
      label: "Indice technique",
      unit: "pts",
      valueType: "NUMBER",
      scale: null,
    });
  });
});

/**
 * Un exercice refuse une écriture fondée sur une version périmée (#604) : deux onglets — bientôt
 * deux Coachs d'une même entreprise — ouverts sur le même exercice s'écrasaient sans un message.
 */
describe("Exercice — version lue (#604)", () => {
  let coach: Agent;
  let exerciseId: string;

  const path = () => `/exercises/${exerciseId}`;
  const patch = (body: Record<string, unknown>, expectedUpdatedAt: string) =>
    coach.patch(path()).send({ ...body, expectedUpdatedAt });
  const current = async () => (await coach.get(path())).body;

  beforeAll(async () => {
    coach = await signUp("exercise-version-coach@cmv.test", Role.COACH);
    const created = await coach.post("/exercises").send({ title: "Suspensions", tags: ["force"] });
    exerciseId = created.body.id;
  });

  it("écrit quand la version lue est la dernière, et la fait avancer", async () => {
    const before = await current();
    const write = await patch({ title: "Suspensions 7/3" }, before.updatedAt);

    expect(write.status).toBe(200);
    expect(write.body.title).toBe("Suspensions 7/3");
    expect(write.body.updatedAt).not.toBe(before.updatedAt);
  });

  // Les tags font partie de l'exercice : les réécrire seuls doit aussi changer la version.
  it("fait avancer la version sur une écriture de tags seuls", async () => {
    const before = await current();
    const write = await patch({ tags: ["force", "doigts"] }, before.updatedAt);

    expect(write.status).toBe(200);
    expect(write.body.updatedAt).not.toBe(before.updatedAt);
  });

  it("refuse une écriture fondée sur une version périmée, et la base garde la première", async () => {
    const read = await current();
    expect((await patch({ title: "Écrit dans l'onglet 1" }, read.updatedAt)).status).toBe(200);
    const kept = await current();

    const stale = await patch({ title: "Écrit dans l'onglet 2", tags: [] }, read.updatedAt);

    expect(stale.status).toBe(409);
    expect(stale.body.message).toBe(STALE_WRITE);
    // Rien de l'écriture refusée ne passe — ni le titre, ni les tags qu'elle aurait vidés.
    expect(await current()).toEqual(kept);
  });

  /**
   * L'onglet 1 retire l'image de la consigne puis le document ; l'onglet 2, resté sur l'ancienne
   * version, la cite encore. C'est un conflit d'édition, pas une saisie invalide : 409, pour que
   * le builder propose de recharger plutôt qu'un « enregistrement impossible ».
   */
  it("répond 409, pas 400, à une version périmée qui cite une image retirée depuis", async () => {
    const image = await uploadInstructionImage(coach, exerciseId);
    const withImage = await patch(
      { instructions: [{ type: "IMAGE", mediaId: image }] },
      (await current()).updatedAt,
    );
    expect(withImage.status).toBe(200);

    expect((await patch({ instructions: null }, withImage.body.updatedAt)).status).toBe(200);
    expect((await coach.delete(`${path()}/documents/${image}`)).status).toBe(204);

    const stale = await patch(
      { instructions: [{ type: "IMAGE", mediaId: image }] },
      withImage.body.updatedAt,
    );

    expect(stale.status).toBe(409);
    expect(stale.body.message).toBe(STALE_WRITE);
  });

  // La comparaison et l'écriture tiennent en une requête : lancées ensemble, une seule passe.
  it("ne laisse passer qu'une écriture sur deux lancées ensemble", async () => {
    const read = await current();
    const [first, second] = await Promise.all([
      patch({ title: "Course A" }, read.updatedAt),
      patch({ title: "Course B" }, read.updatedAt),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const winner = first.status === 200 ? "Course A" : "Course B";
    expect((await current()).title).toBe(winner);
  });

  it("refuse une écriture qui ne dit pas quelle version elle a lue", async () => {
    const before = await current();
    const write = await coach.patch(path()).send({ title: "Sans version" });

    expect(write.status).toBe(400);
    expect(await current()).toEqual(before);
  });

  // « Recharger » n'y trouverait rien : un exercice supprimé se dit 404, pas 409.
  it("répond 404 sur un exercice supprimé, même muni de sa dernière version", async () => {
    const doomed = await coach.post("/exercises").send({ title: "À supprimer" });
    expect((await coach.delete(`/exercises/${doomed.body.id}`)).status).toBe(204);

    const write = await coach
      .patch(`/exercises/${doomed.body.id}`)
      .send({ title: "Trop tard", expectedUpdatedAt: doomed.body.updatedAt });

    expect(write.status).toBe(404);
  });
});
