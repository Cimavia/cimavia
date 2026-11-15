import { ProblemType, Role, shiftIsoDate } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, inviteFor, link, required, signUp } from "../support/actors";
import { blocksOf, repsGrid } from "../support/blocks";
import { fromTemplate, mondayOfCurrentWeek, uploadInstructionImage } from "../support/fixtures";
import { attemptPlanWrites, notFoundEverywhere, withoutSignatures } from "../support/intrusion";
import {
  ANY_VERSION,
  atWeekVersion,
  deleteAtLatest,
  patchAtLatest,
  publishAtLatest,
  putAtLatest,
  versionOf,
} from "../support/version";

describe("Planifications : diffusion & isolation (P3)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let athleteB1: Agent;
  let a1Id: string;
  let b1Id: string;
  let exerciseAId: string;
  let templateId: string;
  let planId: string;
  let week1Id: string;
  let week2Id: string;
  let scheduledId: string;

  const monday = mondayOfCurrentWeek();
  // La semaine 2 commence sept jours après le lundi de départ : une séance doit tomber dans la
  // plage de SA semaine, l'API le vérifie.
  const mondayOfWeek2 = new Date(`${monday}T00:00:00Z`);
  mondayOfWeek2.setUTCDate(mondayOfWeek2.getUTCDate() + 7);
  const mondayOfWeek2Iso = mondayOfWeek2.toISOString().slice(0, 10);

  const LIBRARY_INSTRUCTIONS = [{ type: "PARAGRAPH", content: [{ text: "Coudes serrés." }] }];

  beforeAll(async () => {
    coachA = await signUp("plan-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("plan-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("plan-athlete-a1@cmv.test", Role.ATHLETE);
    athleteB1 = await signUp("plan-athlete-b1@cmv.test", Role.ATHLETE);

    a1Id = await link(coachA, athleteA1);
    b1Id = await link(coachB, athleteB1);

    // Bibliothèque du coach A : un exercice documenté, composé dans une séance modèle.
    const exercise = await coachA.post("/exercises").send({
      title: "Tractions lestées",
      description: "Prise large",
      instructions: LIBRARY_INSTRUCTIONS,
    });
    exerciseAId = exercise.body.id;
    await coachA
      .post(`/exercises/${exerciseAId}/documents`)
      .send({ type: "LINK", url: "https://youtu.be/demo" });

    const template = await coachA.post("/sessions").send({
      title: "Bloc force max",
      notes: "Repos 3 min.",
      blocks: blocksOf({ exerciseId: exerciseAId, note: "5×5" }),
    });
    templateId = template.body.id;
  });

  it("crée un cycle avec ses semaines (type training/deload, nombre libre)", async () => {
    const res = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle bloc — automne",
      description: "Montée en charge puis décharge.",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "DELOAD", note: "volume -40 %" }],
    });
    expect(res.status).toBe(201);
    planId = res.body.id;
    week1Id = res.body.weeks[0].id;
    week2Id = res.body.weeks[1].id;

    expect(res.body.status).toBe("DRAFT");
    expect(res.body.weekCount).toBe(2);
    // Les bornes de semaine sont CALCULÉES à partir du lundi de départ (rien n'est stocké).
    expect(res.body.weeks[0].startDate).toBe(monday);
    expect(res.body.weeks[1].weekNumber).toBe(2);
    expect(res.body.weeks[1].type).toBe("DELOAD");
  });

  it("refuse un cycle qui ne démarre pas un lundi, ou pour l'athlète d'un autre coach", async () => {
    const notMonday = await coachA
      .post("/plans")
      .send({ athleteId: a1Id, title: "x", startDate: "2026-07-14" }); // mardi
    expect(notMonday.status).toBe(400);

    const otherAthlete = await coachA
      .post("/plans")
      .send({ athleteId: b1Id, title: "Intrusion", startDate: monday });
    expect(otherAthlete.status).toBe(400);
  });

  it("instancie une séance : la composition et les documents sont COPIÉS du modèle", async () => {
    const res = await coachA
      .post(`/plan-weeks/${week1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: monday });
    expect(res.status).toBe(201);
    scheduledId = res.body.id;

    expect(res.body.title).toBe("Bloc force max");
    expect(res.body.exercises).toHaveLength(1);
    expect(res.body.exercises[0]).toMatchObject({
      sourceExerciseId: exerciseAId,
      title: "Tractions lestées",
      note: "5×5",
      position: 0,
    });
    // Le document de l'exercice suit la copie : sans lui, l'athlète n'y aurait aucun accès.
    expect(res.body.exercises[0].documents).toHaveLength(1);
    expect(res.body.exercises[0].documents[0].url).toBe("https://youtu.be/demo");
    // Consigne et structure suivent aussi : sans elles l'athlète garderait le titre et perdrait
    // ce qu'il doit faire.
    expect(res.body.exercises[0].instructions).toEqual(LIBRARY_INSTRUCTIONS);
    expect(res.body.blocks[0].exercises[0]).toMatchObject({ key: "a1", grid: repsGrid("a1") });
  });

  /**
   * La séance planifiée naît COPIE de son modèle, titre et notes compris (#723) : elle s'ajuste
   * ensuite. Une création qui voudrait les surcharger, ou composer ses exercices, est refusée.
   */
  it("reprend titre et notes du modèle, et refuse de les surcharger à la création", async () => {
    const inherited = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso });
    expect(inherited.status).toBe(201);
    expect(inherited.body).toMatchObject({ title: "Bloc force max", notes: "Repos 3 min." });
    await deleteAtLatest(coachA, `/scheduled-sessions/${inherited.body.id}`);

    for (const extra of [{ notes: null }, { title: "Autre" }, { exercises: [] }]) {
      const refused = await coachA
        .post(`/plan-weeks/${week2Id}/sessions`)
        .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso, ...extra });
      expect(refused.status).toBe(400);
    }
    const week2 = (await coachA.get(`/plans/${planId}`)).body.weeks[1];
    expect(week2.sessions).toEqual([]);
  });

  // Le modèle est lu par le client TENANT : celui d'un autre coach n'existe pas pour A — refusé
  // comme un identifiant inventé, sans rien en copier ni dire qu'il existe ailleurs.
  it("refuse d'instancier la séance modèle d'un autre coach", async () => {
    const foreign = await coachB.post("/sessions").send({ title: "Modèle de B" });
    expect(foreign.status).toBe(201);

    const res = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: foreign.body.id, scheduledDate: mondayOfWeek2Iso });

    expect(res.status).toBe(400);
    expect(res.body.detail).toBe("Séance modèle inconnue");
    const week2 = (await coachA.get(`/plans/${planId}`)).body.weeks[1];
    expect(week2.sessions).toEqual([]);
  });

  it("la copie est FIGÉE : retravailler l'exercice source ne la touche pas", async () => {
    const patched = await coachA.patch(`/exercises/${exerciseAId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${exerciseAId}`),
      instructions: [{ type: "PARAGRAPH", content: [{ text: "Réécrit après diffusion." }] }],
    });
    expect(patched.status).toBe(200);

    const read = await coachA.get(`/scheduled-sessions/${scheduledId}`);
    expect(read.body.exercises[0].instructions).toEqual(LIBRARY_INSTRUCTIONS);
  });

  it("diffuse la grille de la SÉANCE", async () => {
    // La note est renvoyée telle quelle : ce test ajuste la GRILLE, et les suivants comptent sur
    // le modèle intact — une suite e2e partage ses fixtures.
    const saved = await putAtLatest(coachA, `/sessions/${templateId}`, {
      title: "Bloc force max",
      notes: "Repos 3 min.",
      blocks: blocksOf({ exerciseId: exerciseAId, note: "5×5", grid: repsGrid("a1", 3) }),
    });
    expect(saved.status).toBe(200);

    // Diffusée en semaine 2, dont aucun test ne compte les séances, puis retirée aussitôt : la
    // semaine 1 est le décor d'autres assertions.
    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);
    expect(diffused.body.blocks[0].exercises[0].grid).toEqual(repsGrid("a1", 3));

    // Nettoyage par courtoisie : aucune assertion sur son statut, la semaine 2 n'est comptée
    // nulle part et un échec ici ne dirait rien d'utile.
    await deleteAtLatest(coachA, `/scheduled-sessions/${diffused.body.id}`);
  });

  it("une métrique MAISON citée par un bloc part avec la diffusion", async () => {
    // La régression que ce test verrouille : `customMetricSchema` est `.strict()`, et la ligne
    // Prisma porte `coachId`, `createdAt`, `updatedAt`. La parser telle quelle faisait échouer
    // TOUTE la diffusion en 500 dès qu'un exercice citait une métrique maison — et rien ne le
    // couvrait, la copie du snapshot n'ayant été testée qu'avec des métriques du catalogue.
    const metric = await coachA.post("/custom-metrics").send({
      label: "Cotation française",
      unit: null,
      valueType: "SCALE",
      scale: ["6a", "6b", "6c"],
    });
    expect(metric.status).toBe(201);

    const exercise = await coachA
      .post("/exercises")
      .send({ title: "Voie en 6b", tags: ["grimpe"] });
    expect(exercise.status).toBe(201);

    const grid = {
      metrics: [{ id: "col_grade", source: "CUSTOM", customMetricId: metric.body.id, label: null }],
      rows: [{ id: "r1", values: { col_grade: "6b" } }],
    };
    const template = await coachA.post("/sessions").send({
      title: "Séance métrique maison",
      blocks: blocksOf({ exerciseId: exercise.body.id, grid }),
    });
    expect(template.status).toBe(201);

    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    // La DÉFINITION voyage, pas seulement l'identifiant : `/custom-metrics` est scopé au coach,
    // et l'athlète n'y aura jamais accès.
    expect(diffused.body.exercises[0].customMetrics).toEqual([
      {
        id: metric.body.id,
        label: "Cotation française",
        unit: null,
        valueType: "SCALE",
        scale: ["6a", "6b", "6c"],
      },
    ]);

    await deleteAtLatest(coachA, `/scheduled-sessions/${diffused.body.id}`);
  });

  it("les images de consigne survivent à la diffusion", async () => {
    // Les documents sont recopiés en NOUVELLES lignes : sans remappage, la consigne de l'athlète
    // référencerait des identifiants de la bibliothèque, qui ne désignent rien chez lui — et
    // l'échec serait silencieux, un média introuvable ne s'affichant simplement pas.
    const imageId = await uploadInstructionImage(coachA, exerciseAId);

    const withImage = await coachA.patch(`/exercises/${exerciseAId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/exercises/${exerciseAId}`),
      instructions: [
        { type: "PARAGRAPH", content: [{ text: "Position basse." }] },
        { type: "IMAGE", mediaId: imageId },
      ],
    });
    expect(withImage.status).toBe(200);

    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    const copy = diffused.body.exercises[0];
    const block = copy.instructions.find((item: { type: string }) => item.type === "IMAGE");
    const documentIds = copy.documents.map((document: { id: string }) => document.id);

    // L'identifiant a changé ET il désigne un document de la COPIE.
    expect(block.mediaId).not.toBe(imageId);
    expect(documentIds).toContain(block.mediaId);

    await deleteAtLatest(coachA, `/scheduled-sessions/${diffused.body.id}`);
    await coachA.delete(`/exercises/${exerciseAId}/documents/${imageId}`);
  });

  // Rattachée mais pas citée — l'envoi d'un enregistrement en cours, ou un orphelin d'avant #330.
  it("ne recopie pas une image de consigne que la consigne ne cite pas", async () => {
    const orphan = await uploadInstructionImage(coachA, exerciseAId);
    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    const usages = diffused.body.exercises[0].documents.map(
      (document: { usage: string }) => document.usage,
    );
    expect(usages).not.toContain("INSTRUCTION");

    await deleteAtLatest(coachA, `/scheduled-sessions/${diffused.body.id}`);
    await coachA.delete(`/exercises/${exerciseAId}/documents/${orphan}`);
  });

  it("retirer une image de la consigne garde l'objet que la séance diffusée affiche", async () => {
    const imageId = await uploadInstructionImage(coachA, exerciseAId);
    const withImage = await patchAtLatest(coachA, `/exercises/${exerciseAId}`, {
      instructions: [{ type: "IMAGE", mediaId: imageId }],
    });
    expect(withImage.status).toBe(200);
    const diffused = await coachA
      .post(`/plan-weeks/${week2Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: mondayOfWeek2Iso });
    expect(diffused.status).toBe(201);

    const removed = await patchAtLatest(coachA, `/exercises/${exerciseAId}`, {
      instructions: null,
    });

    expect(removed.status).toBe(200);
    const libraryIds = removed.body.documents.map((document: { id: string }) => document.id);
    expect(libraryIds).not.toContain(imageId);
    const copy = diffused.body.exercises[0].documents.find(
      (document: { usage: string }) => document.usage === "INSTRUCTION",
    );
    expect((await fetch(required(copy, "image de la séance diffusée").url)).status).toBe(200);

    await deleteAtLatest(coachA, `/scheduled-sessions/${diffused.body.id}`);
  });

  it("refuse une séance hors de la plage de sa semaine", async () => {
    const outOfWeek = await coachA
      .post(`/plan-weeks/${week1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: "2027-01-04" });
    expect(outOfWeek.status).toBe(400);
  });

  it("éditer l'instance ne touche PAS le modèle de la bibliothèque", async () => {
    const edited = await putAtLatest(coachA, `/scheduled-sessions/${scheduledId}`, {
      title: "Bloc force max (ajusté)",
      notes: "Épaule sensible",
      scheduledDate: monday,
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      title: "Bloc force max (ajusté)",
      notes: "Épaule sensible",
    });

    const template = await coachA.get(`/sessions/${templateId}`);
    expect(template.body).toMatchObject({ title: "Bloc force max", notes: "Repos 3 min." });
    expect(template.body.exercises[0].note).toBe("5×5");
  });

  it("un brouillon est INVISIBLE de l'athlète (le scope tenant ne filtre pas le statut)", async () => {
    const plans = await athleteA1.get("/me/plans");
    expect(plans.status).toBe(200);
    expect(plans.body).toEqual([]);

    // Même en connaissant l'id exact de la séance.
    expect((await athleteA1.get(`/me/scheduled-sessions/${scheduledId}`)).status).toBe(404);
  });

  it("un coach ne voit ni ne diffuse la planification d'un autre coach", async () => {
    expect((await coachB.get(`/plans/${planId}`)).status).toBe(404);
    expect(
      (await coachB.post(`/plans/${planId}/publish`).send({ expectedUpdatedAt: ANY_VERSION }))
        .status,
    ).toBe(404);
    expect((await coachB.post(`/plans/${planId}/weeks`).send({ type: "TRAINING" })).status).toBe(
      404,
    );
    // Même en citant la bonne version : le scope répond avant elle (#604).
    const atA = await atWeekVersion(coachA, planId, week2Id);
    expect((await coachB.delete(`/plan-weeks/${week2Id}`).query(atA)).status).toBe(404);
    expect((await coachB.get(`/scheduled-sessions/${scheduledId}`)).status).toBe(404);
  });

  // Les écritures, sous le même scope (#325) : le détail des tentatives est dans le harnais.
  it("un coach n'écrit nulle part dans le cycle d'un autre, et le cycle reste intact", async () => {
    const planOfA = async () => withoutSignatures((await coachA.get(`/plans/${planId}`)).body);
    const sessionOfA = async () =>
      withoutSignatures((await coachA.get(`/scheduled-sessions/${scheduledId}`)).body);
    const planBefore = await planOfA();
    const sessionBefore = await sessionOfA();
    expect([planBefore, sessionBefore]).toMatchObject([{ id: planId }, { id: scheduledId }]);

    const statuses = await attemptPlanWrites(coachB, {
      planId,
      weekId: week1Id,
      sessionId: scheduledId,
      monday,
    });

    expect(statuses).toEqual(notFoundEverywhere(statuses));
    expect(await planOfA()).toEqual(planBefore);
    expect(await sessionOfA()).toEqual(sessionBefore);
  });

  it("refuse de diffuser un cycle sans semaine (rien à consulter)", async () => {
    const empty = await coachA
      .post("/plans")
      .send({ athleteId: a1Id, title: "Cycle vide", startDate: monday });
    const res = await publishAtLatest(coachA, empty.body.id);
    expect(res.status).toBe(400);
    await deleteAtLatest(coachA, `/plans/${empty.body.id}`);
  });

  it("diffuse le cycle : DRAFT → PUBLISHED, une seule fois", async () => {
    // Gating P6 : sans facturation saisie, la diffusion est refusée (rien n'est diffusé).
    expect((await publishAtLatest(coachA, planId)).status).toBe(400);

    const billing = await coachA
      .put(`/plans/${planId}/billing`)
      .send({ amountCents: 6000, dueDate: monday });
    expect(billing.status).toBe(200);
    expect(billing.body.status).toBe("DRAFT");

    const res = await publishAtLatest(coachA, planId);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PUBLISHED");
    expect(res.body.publishedAt).not.toBeNull();

    expect((await publishAtLatest(coachA, planId)).status).toBe(409);
  });

  it("l'athlète consulte SON cycle diffusé (semaines + séances) et le détail d'une séance", async () => {
    const plans = await athleteA1.get("/me/plans");
    expect(plans.status).toBe(200);
    expect(plans.body).toHaveLength(1);
    const plan = plans.body[0];
    expect(plan.id).toBe(planId);
    expect(plan.weeks).toHaveLength(2);
    expect(plan.weeks[0].sessions).toHaveLength(1);
    expect(plan.weeks[0].sessions[0]).toMatchObject({
      id: scheduledId,
      scheduledDate: monday,
      status: "PLANNED",
      exerciseCount: 1,
    });

    const session = await athleteA1.get(`/me/scheduled-sessions/${scheduledId}`);
    expect(session.status).toBe(200);
    expect(session.body.exercises[0].title).toBe("Tractions lestées");
    expect(session.body.exercises[0].documents).toHaveLength(1);
  });

  it("l'athlète d'un autre coach ne voit rien de ce cycle", async () => {
    expect((await athleteB1.get("/me/plans")).body).toEqual([]);
    expect((await athleteB1.get(`/me/scheduled-sessions/${scheduledId}`)).status).toBe(404);
  });

  it("les routes de construction restent interdites à l'athlète", async () => {
    expect((await athleteA1.get("/plans")).status).toBe(403);
    expect((await athleteA1.get(`/scheduled-sessions/${scheduledId}`)).status).toBe(403);
    expect((await athleteA1.post(`/plans/${planId}/weeks`).send({ type: "TRAINING" })).status).toBe(
      403,
    );
    // Symétrie : les routes /me/* sont réservées à l'athlète.
    expect((await coachA.get("/me/plans")).status).toBe(403);
  });

  // C'est l'arbitrage du modèle : l'instance est une copie autonome (sourceExerciseId en SetNull),
  // donc la bibliothèque reste librement modifiable — pas de 409 à vie sur un exercice planifié.
  it("supprimer un exercice de la bibliothèque ne casse PAS la planification diffusée", async () => {
    // Il faut d'abord le retirer du MODÈLE (SessionExercise reste en Restrict → 409).
    expect((await deleteAtLatest(coachA, `/exercises/${exerciseAId}`)).status).toBe(409);
    await coachA.put(`/sessions/${templateId}`).send({
      expectedUpdatedAt: await versionOf(coachA, `/sessions/${templateId}`),
      title: "Bloc force max",
      notes: null,
      blocks: [],
    });

    expect((await deleteAtLatest(coachA, `/exercises/${exerciseAId}`)).status).toBe(204);

    // La séance de l'athlète est intacte : titre, note et document toujours là.
    const session = await athleteA1.get(`/me/scheduled-sessions/${scheduledId}`);
    expect(session.status).toBe(200);
    expect(session.body.exercises[0].title).toBe("Tractions lestées");
    expect(session.body.exercises[0].sourceExerciseId).toBeNull(); // FK passée à null
    expect(session.body.exercises[0].documents).toHaveLength(1);
  });
});

/**
 * Ce qui dit au mobile que le déroulé gardé hors-ligne est périmé (#307). Retoucher une séance ne
 * touche PAS la ligne `Plan` : seul `updatedAt` de la séance le signale, et il doit valoir la même
 * chose dans le résumé du planning et dans le détail — c'est leur égalité que le mobile compare.
 */
describe("Retouche d'une séance diffusée : le résumé la signale (#307)", () => {
  it("la date de la séance bouge, celle du cycle non, et le détail suit le résumé", async () => {
    const coach = await signUp("resync-coach@cmv.test", Role.COACH);
    const athlete = await signUp("resync-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);

    const monday = mondayOfCurrentWeek();
    const plan = await coach.post("/plans").send({
      athleteId: accepted.body[0].athleteId,
      title: "Cycle resync",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const session = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send(await fromTemplate(coach, { title: "Séance", scheduledDate: monday }));
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);

    const summaryOf = async () => {
      const plans = await athlete.get("/me/plans");
      return { plan: plans.body[0], session: plans.body[0].weeks[0].sessions[0] };
    };
    const before = await summaryOf();
    const detail = await athlete.get(`/me/scheduled-sessions/${session.body.id}`);
    expect(detail.body.updatedAt).toBe(before.session.updatedAt);

    // `updatedAt` est à la milliseconde : sans cette attente, la retouche peut tomber dessus.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const adjusted = await putAtLatest(coach, `/scheduled-sessions/${session.body.id}`, {
      title: "Séance (ajustée)",
      notes: null,
      scheduledDate: monday,
    });
    expect(adjusted.status).toBe(200);

    const after = await summaryOf();
    expect(after.session.updatedAt).not.toBe(before.session.updatedAt);
    expect(after.plan.updatedAt).toBe(before.plan.updatedAt);
    const refreshed = await athlete.get(`/me/scheduled-sessions/${session.body.id}`);
    expect(refreshed.body.updatedAt).toBe(after.session.updatedAt);
  });
});

/**
 * #172 : un cycle diffusé pouvait rester invisible de son destinataire. `GET /me/plan` n'en servait
 * qu'un (`selectCurrentPlan`), si bien qu'un second cycle diffusé — facturé, notifié — n'atteignait
 * jamais l'athlète, et que rien nulle part ne le signalait au coach.
 *
 * `GET /me/plans` les sert TOUS. Ce que ces tests tiennent, c'est l'accumulation : diffuser
 * n'écarte rien de ce qui est déjà diffusé.
 */
describe("Les cycles diffusés s'accumulent chez l'athlète (#172)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteMany: Agent;
  let athleteEnded: Agent;
  let athleteDraft: Agent;
  let athleteB1: Agent;
  let draftSessionId: string;

  const monday = mondayOfCurrentWeek();
  const weeksFrom = (mondays: number): string => {
    const date = shiftIsoDate(monday, mondays * 7);
    if (date == null) throw new Error("[test] date de départ de cycle introuvable");
    return date;
  };

  /**
   * Un cycle garni d'une séance, pour que la lecture athlète porte sur autre chose qu'un en-tête.
   * Le nombre de semaines décide de l'ÉPOQUE autant que la date de début : un cycle d'une semaine
   * démarré il y a deux semaines est terminé, pas en cours.
   */
  async function draft(
    coach: Agent,
    athleteId: string,
    title: string,
    startDate: string,
    weekCount = 1,
  ) {
    const plan = await coach.post("/plans").send({
      athleteId,
      title,
      startDate,
      weeks: Array.from({ length: weekCount }, () => ({ type: "TRAINING" })),
    });
    expect(plan.status).toBe(201);
    const session = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send(await fromTemplate(coach, { title: `Séance — ${title}`, scheduledDate: startDate }));
    expect(session.status).toBe(201);
    return { planId: plan.body.id as string, sessionId: session.body.id as string };
  }

  async function published(
    coach: Agent,
    athleteId: string,
    title: string,
    startDate: string,
    weekCount = 1,
  ) {
    const { planId } = await draft(coach, athleteId, title, startDate, weekCount);
    expect((await billAndPublish(coach, planId)).status).toBe(200);
    return planId;
  }

  const titlesSeenBy = async (athlete: Agent): Promise<string[]> => {
    const res = await athlete.get("/me/plans");
    expect(res.status).toBe(200);
    return (res.body as { title: string }[]).map((plan) => plan.title);
  };

  beforeAll(async () => {
    coachA = await signUp("cumul-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("cumul-coach-b@cmv.test", Role.COACH);
    athleteMany = await signUp("cumul-many@cmv.test", Role.ATHLETE);
    athleteEnded = await signUp("cumul-ended@cmv.test", Role.ATHLETE);
    athleteDraft = await signUp("cumul-draft@cmv.test", Role.ATHLETE);
    athleteB1 = await signUp("cumul-b1@cmv.test", Role.ATHLETE);

    const manyId = await link(coachA, athleteMany);
    const endedId = await link(coachA, athleteEnded);
    const draftId = await link(coachA, athleteDraft);
    await link(coachB, athleteB1);

    // Deux cycles qui COURENT tous les deux, plus un qui arrive : le cas que #172 servait à moitié.
    await published(coachA, manyId, "En cours depuis 2 semaines", weeksFrom(-2), 4);
    await published(coachA, manyId, "En cours depuis lundi", weeksFrom(0));
    await published(coachA, manyId, "À venir dans 6 semaines", weeksFrom(6));

    // Deux cycles terminés, rien derrière.
    await published(coachA, endedId, "Terminé il y a longtemps", weeksFrom(-20));
    await published(coachA, endedId, "Terminé récemment", weeksFrom(-8));

    ({ sessionId: draftSessionId } = await draft(coachA, draftId, "Brouillon", weeksFrom(0)));
  });

  it("sert les DEUX cycles en cours, et pas seulement le dernier démarré", async () => {
    const titles = await titlesSeenBy(athleteMany);
    expect(titles).toContain("En cours depuis 2 semaines");
    expect(titles).toContain("En cours depuis lundi");
  });

  it("sert aussi le cycle à venir, en cours d'abord et par date de début croissante", async () => {
    expect(await titlesSeenBy(athleteMany)).toEqual([
      "En cours depuis 2 semaines",
      "En cours depuis lundi",
      "À venir dans 6 semaines",
    ]);
  });

  it("sert les semaines et les séances de chaque cycle, pas seulement leurs en-têtes", async () => {
    const res = await athleteMany.get("/me/plans");
    for (const plan of res.body as { weeks: { sessions: unknown[] }[] }[]) {
      // La séance est posée en semaine 1 de chaque cycle ; les semaines suivantes sont vides.
      expect(plan.weeks.length).toBeGreaterThanOrEqual(1);
      expect(plan.weeks[0]?.sessions).toHaveLength(1);
    }
  });

  /**
   * Le repli, et il compte : sans lui, un athlète entre deux cycles verrait un écran vide au lieu
   * du dernier cycle reçu. Un seul cycle, le plus récent — pas son historique entier.
   */
  it("retombe sur le dernier cycle terminé, seul, quand plus rien ne court", async () => {
    expect(await titlesSeenBy(athleteEnded)).toEqual(["Terminé récemment"]);
  });

  it("rend une liste VIDE — jamais null — pour un athlète sans cycle diffusé", async () => {
    const res = await athleteDraft.get("/me/plans");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("ne sert JAMAIS un brouillon, même en connaissant l'id exact de sa séance", async () => {
    expect(await titlesSeenBy(athleteDraft)).toEqual([]);
    expect((await athleteDraft.get(`/me/scheduled-sessions/${draftSessionId}`)).status).toBe(404);
  });

  it("ne fuit rien vers l'athlète d'un autre coach", async () => {
    expect(await titlesSeenBy(athleteB1)).toEqual([]);
  });

  it("reste fermée au coach, comme le reste de /me (@Roles ATHLETE)", async () => {
    expect((await coachA.get("/me/plans")).status).toBe(403);
    expect((await coachB.get("/me/plans")).status).toBe(403);
  });
});

/**
 * L'en-tête d'un cycle refuse une écriture fondée sur une version périmée (#604) : deux Coachs d'une
 * même entreprise retouchent le même cycle, et le second n'efface plus le premier en silence.
 */
describe("Cycle — version lue (#604)", () => {
  let coach: Agent;
  let other: Agent;
  let athleteId: string;
  let otherAthleteId: string;
  let planId: string;

  const monday = mondayOfCurrentWeek();
  const path = () => `/plans/${planId}`;
  const current = async () => (await coach.get(path())).body;
  const rename = (title: string, expectedUpdatedAt: string, id = planId) =>
    coach.patch(`/plans/${id}`).send({ title, expectedUpdatedAt });

  /** Un brouillon garni d'une séance : de quoi le diffuser. */
  async function draft(title: string): Promise<string> {
    const plan = await coach
      .post("/plans")
      .send({ athleteId, title, startDate: monday, weeks: [{ type: "TRAINING" }] });
    expect(plan.status).toBe(201);
    const session = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send(await fromTemplate(coach, { title: "Séance", scheduledDate: monday }));
    expect(session.status).toBe(201);
    return plan.body.id;
  }

  beforeAll(async () => {
    coach = await signUp("plan-version-coach@cmv.test", Role.COACH);
    other = await signUp("plan-version-other@cmv.test", Role.COACH);
    athleteId = await link(coach, await signUp("plan-version-athlete@cmv.test", Role.ATHLETE));
    otherAthleteId = await link(
      coach,
      await signUp("plan-version-athlete-2@cmv.test", Role.ATHLETE),
    );
    planId = await draft("Bloc");
  });

  it("écrit quand la version lue est la dernière, et la fait avancer", async () => {
    const before = await current();
    const write = await rename("Bloc (v2)", before.updatedAt);

    expect(write.status).toBe(200);
    expect(write.body.updatedAt).not.toBe(before.updatedAt);
  });

  it("refuse une écriture fondée sur une version périmée, et la base garde la première", async () => {
    const read = await current();
    expect((await rename("Écrit par le coach 1", read.updatedAt)).status).toBe(200);
    const kept = await current();

    const stale = await coach.patch(path()).send({
      title: "Écrit par le coach 2",
      startDate: shiftIsoDate(monday, 7),
      expectedUpdatedAt: read.updatedAt,
    });

    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
    // Ni le titre, ni le décalage des séances qu'aurait emporté la date de début.
    expect(await current()).toEqual(kept);
  });

  it("ne laisse passer qu'une écriture sur deux lancées ensemble", async () => {
    const read = await current();
    const [first, second] = await Promise.all([
      rename("Course A", read.updatedAt),
      rename("Course B", read.updatedAt),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  it("ne fait pas avancer la version d'un enregistrement qui ne change rien", async () => {
    const before = await current();
    const write = await coach.patch(path()).send({ expectedUpdatedAt: before.updatedAt });

    expect(write.status).toBe(200);
    expect(await current()).toEqual(before);
  });

  it("refuse une écriture qui ne dit pas quelle version elle a lue", async () => {
    const before = await current();
    const write = await coach.patch(path()).send({ title: "Sans version" });

    expect(write.status).toBe(400);
    expect(await current()).toEqual(before);
  });

  /**
   * Le conflit passe AVANT le verrou de diffusion : la saisie n'a pas vu le cycle diffusé, et
   * « Recharger » le lui montrera — un refus « cycle diffusé » lui parlerait d'un état inconnu.
   */
  it("répond par un conflit de version sur un cycle diffusé depuis la lecture", async () => {
    const id = await draft("Diffusé entre-temps");
    const read = await versionOf(coach, `/plans/${id}`);
    expect((await billAndPublish(coach, id)).status).toBe(200);

    const stale = await rename("Trop tard", read, id);

    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
  });

  // Un 409 apprendrait à l'autre coach que le cycle existe.
  it("répond 404 à un autre coach, même muni de la dernière version", async () => {
    const read = await current();
    const write = await other
      .patch(path())
      .send({ title: "Intrusion", expectedUpdatedAt: read.updatedAt });

    expect(write.status).toBe(404);
    expect(await current()).toEqual(read);
  });

  /** Un brouillon prêt à partir — semaine, séance, facturation : seule la version peut le retenir. */
  async function billed(title: string): Promise<string> {
    const id = await draft(title);
    const billing = await coach
      .put(`/plans/${id}/billing`)
      .send({ amountCents: 5000, dueDate: "2026-01-05" });
    expect(billing.status).toBe(200);
    return id;
  }

  const publish = (id: string, expectedUpdatedAt: string) =>
    coach.post(`/plans/${id}/publish`).send({ expectedUpdatedAt });
  const remove = (id: string, expectedUpdatedAt: string) =>
    coach.delete(`/plans/${id}`).query({ expectedUpdatedAt });
  const reassign = (id: string, expectedUpdatedAt: string) =>
    coach.patch(`/plans/${id}`).send({ athleteId: otherAthleteId, expectedUpdatedAt });

  /**
   * Le cas qui fait mal : un autre Coach réaffecte le cycle pendant que le premier le regarde. Sans
   * la version, la diffusion partait chez un athlète qu'il n'a jamais vu — notifié, et facturé.
   */
  it("refuse une diffusion fondée sur une version périmée : le cycle réaffecté reste un brouillon", async () => {
    const id = await billed("Réaffecté entre-temps");
    const read = await versionOf(coach, `/plans/${id}`);
    expect((await reassign(id, read)).status).toBe(200);

    const stale = await publish(id, read);

    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
    const plan = (await coach.get(`/plans/${id}`)).body;
    expect(plan.status).toBe("DRAFT");
    expect((await coach.get(`/plans/${id}/billing`)).body.status).toBe("DRAFT");
  });

  // L'écriture conditionnelle, et non la seule lecture : entre les deux, l'autre passerait.
  it("diffusion et réaffectation lancées ensemble : une seule passe, et la diffusion part chez l'athlète lu", async () => {
    const id = await billed("Course diffusion");
    const read = await versionOf(coach, `/plans/${id}`);

    const [published, reassigned] = await Promise.all([publish(id, read), reassign(id, read)]);

    expect([published.status, reassigned.status].sort()).toEqual([200, 409]);
    const plan = (await coach.get(`/plans/${id}`)).body;
    if (published.status === 200) {
      expect(plan.status).toBe("PUBLISHED");
      expect(plan.athleteId).toBe(athleteId);
      const invoices: { planId: string; athleteId: string }[] = (await coach.get("/invoices")).body;
      expect(invoices.find((invoice) => invoice.planId === id)?.athleteId).toBe(athleteId);
    } else {
      expect(plan.status).toBe("DRAFT");
      expect(plan.athleteId).toBe(otherAthleteId);
    }
  });

  it("refuse une suppression fondée sur une version périmée, et garde le cycle", async () => {
    const id = await draft("Retouché entre-temps");
    const read = await versionOf(coach, `/plans/${id}`);
    expect((await rename("Retouché", read, id)).status).toBe(200);

    const stale = await remove(id, read);

    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
    expect((await coach.get(`/plans/${id}`)).body.title).toBe("Retouché");
  });

  // La cascade emporterait sinon un cycle tout juste diffusé, et sa facture émise.
  it("suppression et diffusion lancées ensemble : jamais un cycle diffusé supprimé", async () => {
    const id = await billed("Course suppression");
    const read = await versionOf(coach, `/plans/${id}`);

    const [published, removed] = await Promise.all([publish(id, read), remove(id, read)]);

    // Diffusé d'abord, il ne se supprime plus ; supprimé d'abord, il n'y a plus rien à diffuser.
    const plan = await coach.get(`/plans/${id}`);
    if (published.status === 200) {
      expect(removed.status).toBe(409);
      expect(plan.body.status).toBe("PUBLISHED");
    } else {
      expect([published.status, removed.status]).toEqual([404, 204]);
      expect(plan.status).toBe(404);
    }
  });

  it("refuse une diffusion ou une suppression qui ne dit pas quelle version elle a lue", async () => {
    const id = await billed("Sans version");

    expect((await coach.post(`/plans/${id}/publish`)).status).toBe(400);
    expect((await coach.delete(`/plans/${id}`)).status).toBe(400);
    expect((await coach.get(`/plans/${id}`)).body.status).toBe("DRAFT");
  });

  it("répond 404 sur un cycle supprimé, même muni de sa dernière version", async () => {
    const id = await draft("À supprimer");
    const read = await versionOf(coach, `/plans/${id}`);
    expect((await deleteAtLatest(coach, `/plans/${id}`)).status).toBe(204);

    expect((await rename("Trop tard", read, id)).status).toBe(404);
  });
});
