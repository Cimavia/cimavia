import { PLAN_MAX_WEEKS, Role, shiftIsoDate } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, link, required, signUp } from "../support/actors";
import { mondayOfCurrentWeek, uploadInstructionImage } from "../support/fixtures";
import { patchAtLatest } from "../support/version";

describe("Semaines d'un cycle : ajout, plafond et retrait", () => {
  let coach: Agent;
  let other: Agent;
  let athlete: Agent;
  let athleteId: string;
  let secondAthleteId: string;
  let foreignAthleteId: string;

  const monday = mondayOfCurrentWeek();
  const day = (offset: number) =>
    required(shiftIsoDate(monday, offset) ?? undefined, `J+${offset}`);

  beforeAll(async () => {
    coach = await signUp("weeks-coach@cmv.test", Role.COACH);
    other = await signUp("weeks-other@cmv.test", Role.COACH);
    athlete = await signUp("weeks-athlete@cmv.test", Role.ATHLETE);
    athleteId = await link(coach, athlete);
    secondAthleteId = await link(coach, await signUp("weeks-athlete-2@cmv.test", Role.ATHLETE));
    foreignAthleteId = await link(other, await signUp("weeks-foreign@cmv.test", Role.ATHLETE));
  });

  // La semaine ajoutée va EN FIN de cycle : ses dates se calculent depuis le lundi de départ.
  it("ajoute une semaine en fin de cycle, datée à la suite", async () => {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Ajout",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });

    const res = await coach
      .post(`/plans/${plan.body.id}/weeks`)
      .send({ type: "DELOAD", note: "décharge" });

    expect(res.status).toBe(201);
    expect(res.body.weekCount).toBe(2);
    expect(res.body.weeks[1]).toMatchObject({
      weekNumber: 2,
      type: "DELOAD",
      note: "décharge",
      startDate: day(7),
      endDate: day(13),
      sessions: [],
    });
  });

  it(`refuse une semaine au-delà de ${PLAN_MAX_WEEKS}, sans rien écrire`, async () => {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Saison pleine",
      startDate: monday,
      weeks: Array.from({ length: PLAN_MAX_WEEKS }, () => ({ type: "TRAINING" })),
    });
    expect(plan.status).toBe(201);

    const res = await coach.post(`/plans/${plan.body.id}/weeks`).send({ type: "TRAINING" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`Un cycle ne peut pas dépasser ${PLAN_MAX_WEEKS} semaines`);
    expect((await coach.get(`/plans/${plan.body.id}`)).body.weekCount).toBe(PLAN_MAX_WEEKS);
  });

  /**
   * Retirer une semaine du MILIEU : les suivantes remontent d'un rang, et leurs séances d'une
   * semaine avec elles. Sans ce décalage, la séance de l'ancienne S3 resterait datée de S3 dans
   * une semaine devenue S2 — hors de sa plage, invisible au bon endroit du calendrier.
   */
  it("retire une semaine du milieu : les suivantes et leurs séances remontent", async () => {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Retrait",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "DELOAD" }, { type: "TRAINING", note: "reprise" }],
    });
    const [, week2, week3] = plan.body.weeks;
    const doomed = await coach
      .post(`/plan-weeks/${week2.id}/sessions`)
      .send({ title: "Supprimée avec sa semaine", scheduledDate: day(7) });
    const moved = await coach
      .post(`/plan-weeks/${week3.id}/sessions`)
      .send({ title: "Mardi de S3", scheduledDate: day(15) });
    expect(moved.status).toBe(201);

    const res = await coach.delete(`/plan-weeks/${week2.id}`);

    expect(res.status).toBe(200);
    expect(res.body.weekCount).toBe(2);
    expect(res.body.weeks[1]).toMatchObject({
      id: week3.id,
      weekNumber: 2,
      note: "reprise",
      startDate: day(7),
      sessions: [{ id: moved.body.id, scheduledDate: day(8) }],
    });
    // La séance de la semaine retirée part avec elle.
    expect((await coach.get(`/scheduled-sessions/${doomed.body.id}`)).status).toBe(404);
  });

  // PATCH partiel : le champ absent ne change pas. Un `type` réécrit par défaut ferait basculer
  // une décharge en entraînement le jour où le coach ne touche qu'à la note.
  it("modifie la note seule, puis le type seul, sans écraser l'autre", async () => {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Retouches",
      startDate: monday,
      weeks: [{ type: "DELOAD", note: "volume -40 %" }],
    });
    const weekId = plan.body.weeks[0].id;

    const noted = await coach.patch(`/plan-weeks/${weekId}`).send({ note: "volume -30 %" });
    expect(noted.status).toBe(200);
    expect(noted.body.weeks[0]).toMatchObject({ type: "DELOAD", note: "volume -30 %" });

    const typed = await coach.patch(`/plan-weeks/${weekId}`).send({ type: "TRAINING" });
    expect(typed.body.weeks[0]).toMatchObject({ type: "TRAINING", note: "volume -30 %" });
  });

  it("la dernière semaine se retire sans rien renuméroter", async () => {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Fin",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "DELOAD" }],
    });

    const res = await coach.delete(`/plan-weeks/${plan.body.weeks[1].id}`);

    expect(res.body.weeks).toEqual([
      expect.objectContaining({ id: plan.body.weeks[0].id, weekNumber: 1, startDate: monday }),
    ]);
  });

  /**
   * Sur un cycle DIFFUSÉ, le retrait ferait glisser d'une semaine le planning de l'athlète, en
   * silence (#312). Le 409 doit laisser le cycle intact : aucune semaine retirée, aucune
   * renumérotée, aucune séance décalée.
   */
  it("refuse de retirer une semaine d'un cycle diffusé (409), sans rien décaler", async () => {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Diffusé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "DELOAD" }, { type: "TRAINING" }],
    });
    const [, week2, week3] = plan.body.weeks;
    const kept = await coach
      .post(`/plan-weeks/${week3.id}/sessions`)
      .send({ title: "Mardi de S3", scheduledDate: day(15) });
    expect(kept.status).toBe(201);
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);

    const res = await coach.delete(`/plan-weeks/${week2.id}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("diffusé");
    const after = await coach.get(`/plans/${plan.body.id}`);
    expect(after.body.weeks.map((w: { id: string }) => w.id)).toEqual(
      plan.body.weeks.map((w: { id: string }) => w.id),
    );
    expect(after.body.weeks[2]).toMatchObject({
      weekNumber: 3,
      startDate: day(14),
      sessions: [{ id: kept.body.id, scheduledDate: day(15) }],
    });
  });

  // Le cycle entier non plus (#85) : sa facture est émise, et la cascade l'emporterait.
  it("refuse de supprimer un cycle diffusé (409) : cycle et facture restent", async () => {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Diffusé, à garder",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);

    const res = await coach.delete(`/plans/${plan.body.id}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain("diffusé");
    expect((await coach.get(`/plans/${plan.body.id}`)).body.status).toBe("PUBLISHED");
    const invoices = (await coach.get("/invoices")).body as { planId: string; status: string }[];
    expect(invoices.find((invoice) => invoice.planId === plan.body.id)?.status).toBe("PENDING");
  });

  // Le filtre de la liste des cycles, côté coach : l'écran d'un athlète ne montre que les siens.
  it("filtre les cycles par athlète, sans franchir la frontière du coach", async () => {
    const mine = await coach
      .post("/plans")
      .send({ athleteId: secondAthleteId, title: "Pour le second", startDate: monday });

    const filtered = await coach.get("/plans").query({ athleteId: secondAthleteId });
    expect(filtered.status).toBe(200);
    expect(filtered.body.map((plan: { id: string }) => plan.id)).toEqual([mine.body.id]);

    // L'athlète d'un autre coach : une liste vide, pas ses cycles.
    await other
      .post("/plans")
      .send({ athleteId: foreignAthleteId, title: "Chez l'autre", startDate: monday });
    expect((await coach.get("/plans").query({ athleteId: foreignAthleteId })).body).toEqual([]);
  });

  /**
   * Affecter un brouillon propage l'athlète à toute la chaîne (semaines, séances, exercices). Un
   * cycle encore VIDE, ou aux séances sans exercice, doit l'accepter aussi : c'est l'état d'un
   * brouillon qu'on commence tout juste.
   */
  it("affecte un brouillon vide, puis aux séances sans exercice, que l'athlète lit une fois diffusé", async () => {
    const empty = await coach
      .post("/plans")
      .send({ title: "Encore vide", startDate: monday, weeks: [{ type: "TRAINING" }] });
    const assignedEmpty = await patchAtLatest(coach, `/plans/${empty.body.id}`, { athleteId });
    expect(assignedEmpty.status).toBe(200);
    expect(assignedEmpty.body.athleteId).toBe(athleteId);

    const bare = await coach
      .post("/plans")
      .send({ title: "Séance nue", startDate: monday, weeks: [{ type: "TRAINING" }] });
    const session = await coach
      .post(`/plan-weeks/${bare.body.weeks[0].id}/sessions`)
      .send({ title: "Échauffement libre", scheduledDate: monday });
    expect(session.body.exercises).toEqual([]);

    expect((await patchAtLatest(coach, `/plans/${bare.body.id}`, { athleteId })).status).toBe(200);
    expect((await billAndPublish(coach, bare.body.id)).status).toBe(200);

    const read = await athlete.get(`/me/scheduled-sessions/${session.body.id}`);
    expect(read.status).toBe(200);
    expect(read.body.title).toBe("Échauffement libre");
  });
});

/**
 * Copier/coller une semaine (#4).
 *
 * Ce que la copie emporte est ce que le COACH a composé ; ce qu'elle laisse appartient à l'athlète
 * ou à l'exécution. Les dates ne sont pas recopiées mais RECALCULÉES depuis le lundi de la semaine
 * cible — c'est la seule façon de rester dans la plage de sa semaine en changeant de cycle.
 */
describe("Copie d'une semaine de planification (#4)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let athleteA2: Agent;
  let a1Id: string;
  let a2Id: string;

  let templateId: string;
  let exerciseId: string;
  let draftPlanId: string;
  let w1Id: string;
  let w2Id: string;
  let w3Id: string;
  let w4Id: string;
  // Cycle d'un AUTRE athlète, démarrant 8 semaines plus tard : la copie y change d'athlète ET de
  // référentiel de dates.
  let otherPlanId: string;
  let otherWeekId: string;
  // Cycle diffusé de A1 : sert de source autorisée (lecture seule) et de cible refusée.
  let livePlanId: string;
  let liveWeekId: string;
  let liveSessionId: string;
  let foreignWeekId: string;

  const monday = mondayOfCurrentWeek();
  const otherMonday = shiftIsoDate(monday, 56) as string;
  const day = (offset: number) => shiftIsoDate(monday, offset) as string;

  // Le contenu d'une semaine, tel que le builder le lit.
  async function weekOf(coach: Agent, planId: string, weekId: string) {
    const plan = await coach.get(`/plans/${planId}`);
    return plan.body.weeks.find((w: { id: string }) => w.id === weekId);
  }

  async function paste(coach: Agent, targetWeekId: string, sourcePlanWeekId: string) {
    return coach.post(`/plan-weeks/${targetWeekId}/copy-from`).send({ sourcePlanWeekId });
  }

  beforeAll(async () => {
    coachA = await signUp("copy-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("copy-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("copy-athlete-a1@cmv.test", Role.ATHLETE);
    athleteA2 = await signUp("copy-athlete-a2@cmv.test", Role.ATHLETE);
    const athleteB1 = await signUp("copy-athlete-b1@cmv.test", Role.ATHLETE);

    a1Id = await link(coachA, athleteA1);
    a2Id = await link(coachA, athleteA2);
    const b1Id = await link(coachB, athleteB1);

    // Bibliothèque de A : un exercice documenté, composé dans une séance modèle.
    const exercise = await coachA
      .post("/exercises")
      .send({ title: "Suspensions", description: "Réglette 20 mm", tags: ["grimpe"] });
    exerciseId = exercise.body.id;
    await coachA
      .post(`/exercises/${exerciseId}/documents`)
      .send({ type: "LINK", url: "https://youtu.be/hangboard" });

    const template = await coachA.post("/sessions").send({
      title: "Doigts",
      notes: "Échauffement long.",
      exercises: [{ exerciseId, note: "6×10 s" }],
    });
    templateId = template.body.id;

    // Cycle brouillon de A1 : 4 semaines.
    const draft = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle copie",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }, { type: "TRAINING" }, { type: "DELOAD" }],
    });
    draftPlanId = draft.body.id;
    [w1Id, w2Id, w3Id, w4Id] = draft.body.weeks.map((w: { id: string }) => w.id);

    // Semaine 1 : deux séances le même lundi (positions 0 et 1) + une le mercredi.
    await coachA
      .post(`/plan-weeks/${w1Id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: day(0) });
    await coachA
      .post(`/plan-weeks/${w1Id}/sessions`)
      .send({ title: "Renfo court", scheduledDate: day(0) });
    await coachA
      .post(`/plan-weeks/${w1Id}/sessions`)
      .send({ title: "Voie", scheduledDate: day(2) });

    // Semaine 3 : déjà occupée — elle devra être REMPLACÉE, pas fusionnée.
    await coachA
      .post(`/plan-weeks/${w3Id}/sessions`)
      .send({ title: "À écraser", scheduledDate: day(15) });

    // Cycle d'un autre athlète, 8 semaines plus tard.
    const other = await coachA.post("/plans").send({
      athleteId: a2Id,
      title: "Cycle de A2",
      startDate: otherMonday,
      weeks: [{ type: "TRAINING" }],
    });
    otherPlanId = other.body.id;
    otherWeekId = other.body.weeks[0].id;

    // Cycle diffusé de A1, avec une séance que l'athlète débriefera (→ DONE).
    const live = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle diffusé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    livePlanId = live.body.id;
    liveWeekId = live.body.weeks[0].id;
    const liveSession = await coachA
      .post(`/plan-weeks/${liveWeekId}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: day(1) });
    liveSessionId = liveSession.body.id;
    expect((await billAndPublish(coachA, livePlanId)).status).toBe(200);

    await athleteA1
      .put(`/me/scheduled-sessions/${liveSessionId}/feedback`)
      .send({ content: "Bonnes sensations." });

    // Une semaine chez le coach B, pour les contrôles d'appartenance.
    const foreign = await coachB.post("/plans").send({
      athleteId: b1Id,
      title: "Chez B",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    foreignWeekId = foreign.body.weeks[0].id;
  });

  it("colle le contenu d'une semaine dans une autre, en REMPLAÇANT ce qui s'y trouvait", async () => {
    const res = await paste(coachA, w3Id, w1Id);
    expect(res.status).toBe(201);

    const week3 = res.body.weeks.find((w: { id: string }) => w.id === w3Id);
    expect(week3.sessions).toHaveLength(3);
    // Fusion impossible (unicité semaine/date/position) : la séance qui occupait la cible a disparu.
    expect(week3.sessions.some((s: { title: string }) => s.title === "À écraser")).toBe(false);

    // Deux semaines plus loin : le lundi reste un lundi, le mercredi un mercredi.
    const byTitle = (title: string) =>
      week3.sessions.find((s: { title: string }) => s.title === title);
    expect(byTitle("Doigts").scheduledDate).toBe(day(14));
    expect(byTitle("Renfo court").scheduledDate).toBe(day(14));
    expect(byTitle("Voie").scheduledDate).toBe(day(16));

    // L'ordre DANS la journée est une intention du coach : il est recopié tel quel.
    expect(byTitle("Doigts").position).toBe(0);
    expect(byTitle("Renfo court").position).toBe(1);
    expect(byTitle("Voie").position).toBe(0);

    // La semaine source est intacte : c'est une copie, pas un déplacement.
    expect((await weekOf(coachA, draftPlanId, w1Id)).sessions).toHaveLength(3);
  });

  it("emporte la composition et les documents, en lignes NEUVES", async () => {
    const week3 = await weekOf(coachA, draftPlanId, w3Id);
    const copyId = week3.sessions.find((s: { title: string }) => s.title === "Doigts").id;

    const detail = await coachA.get(`/scheduled-sessions/${copyId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.notes).toBe("Échauffement long.");
    expect(detail.body.exercises).toHaveLength(1);
    expect(detail.body.exercises[0]).toMatchObject({
      sourceExerciseId: exerciseId,
      title: "Suspensions",
      note: "6×10 s",
      position: 0,
    });
    // Le document suit la copie — même lien, ligne distincte de celle de la séance source.
    expect(detail.body.exercises[0].documents).toHaveLength(1);
    expect(detail.body.exercises[0].documents[0].url).toBe("https://youtu.be/hangboard");

    const source = await weekOf(coachA, draftPlanId, w1Id);
    const sourceId = source.sessions.find((s: { title: string }) => s.title === "Doigts").id;
    expect(copyId).not.toBe(sourceId);
    const sourceDetail = await coachA.get(`/scheduled-sessions/${sourceId}`);
    expect(sourceDetail.body.exercises[0].id).not.toBe(detail.body.exercises[0].id);
  });

  it("les images de consigne suivent la copie : elles citent les documents de la semaine cible", async () => {
    // La copie recrée les documents depuis l'INSTANCE source, dont la consigne cite les copies —
    // pas la bibliothèque. Sans remappage sur les nouvelles lignes, l'image ne désignerait plus rien.
    const exercise = await coachA.post("/exercises").send({ title: "Planche" });
    const imageId = await uploadInstructionImage(coachA, exercise.body.id);

    const plan = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle images",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }],
    });
    const [sourceWeekId, targetWeekId] = plan.body.weeks.map((w: { id: string }) => w.id);
    const source = await coachA.post(`/plan-weeks/${sourceWeekId}/sessions`).send({
      title: "Gainage",
      scheduledDate: day(0),
      exercises: [
        {
          sourceExerciseId: exercise.body.id,
          title: "Planche",
          instructions: [{ type: "IMAGE", mediaId: imageId }],
        },
      ],
    });
    expect(source.status).toBe(201);
    const sourceMediaId = source.body.exercises[0].instructions[0].mediaId;

    expect((await paste(coachA, targetWeekId, sourceWeekId)).status).toBe(201);

    const target = await weekOf(coachA, plan.body.id, targetWeekId);
    const copied = await coachA.get(`/scheduled-sessions/${target.sessions[0].id}`);
    const line = copied.body.exercises[0];
    const mediaId = line.instructions[0].mediaId;
    expect(mediaId).not.toBe(sourceMediaId);
    expect(line.documents.map((d: { id: string }) => d.id)).toContain(mediaId);

    await coachA.delete(`/plans/${plan.body.id}`);
  });

  it("emporte le type et la note de la semaine, pas seulement ses séances", async () => {
    await coachA.patch(`/plan-weeks/${w1Id}`).send({ type: "DELOAD", note: "volume -40 %" });

    const res = await paste(coachA, w4Id, w1Id);
    expect(res.status).toBe(201);

    const week4 = res.body.weeks.find((w: { id: string }) => w.id === w4Id);
    expect(week4.type).toBe("DELOAD");
    expect(week4.note).toBe("volume -40 %");

    await coachA.patch(`/plan-weeks/${w1Id}`).send({ type: "TRAINING", note: null });
  });

  it("une séance faite arrive PLANNED, et son débrief ne la suit pas", async () => {
    // La source est le cycle DIFFUSÉ : y lire ne le mute pas, et c'est le cas d'usage réel
    // (« reprendre le bloc du mois dernier »).
    const res = await paste(coachA, w2Id, liveWeekId);
    expect(res.status).toBe(201);

    const week2 = res.body.weeks.find((w: { id: string }) => w.id === w2Id);
    expect(week2.sessions).toHaveLength(1);
    // Le statut décrit l'EXÉCUTION de l'athlète, pas la composition du coach.
    expect(week2.sessions[0].status).toBe("PLANNED");
    // Une séance non débriefée rend `null`, pas un 404 (règle nullable) : c'est l'absence d'id
    // qui dit que le débrief n'a pas suivi la copie.
    const copyFeedback = await coachA.get(`/scheduled-sessions/${week2.sessions[0].id}/feedback`);
    expect(copyFeedback.status).toBe(200);
    expect(copyFeedback.body?.id).toBeUndefined();

    // La séance source, elle, garde son statut et son débrief.
    const live = await weekOf(coachA, livePlanId, liveWeekId);
    expect(live.sessions[0].status).toBe("DONE");
    const sourceFeedback = await coachA.get(`/scheduled-sessions/${liveSessionId}/feedback`);
    expect(sourceFeedback.body.content).toBe("Bonnes sensations.");
  });

  it("colle vers le cycle d'un AUTRE athlète : les séances atterrissent chez lui seul", async () => {
    const res = await paste(coachA, otherWeekId, w1Id);
    expect(res.status).toBe(201);

    const week = res.body.weeks.find((w: { id: string }) => w.id === otherWeekId);
    expect(week.sessions).toHaveLength(3);
    // Référentiel de dates de la CIBLE : 8 semaines plus loin, le lundi reste un lundi.
    expect(week.sessions.map((s: { scheduledDate: string }) => s.scheduledDate)).toContain(
      shiftIsoDate(otherMonday, 0),
    );
    expect(week.sessions.map((s: { scheduledDate: string }) => s.scheduledDate)).toContain(
      shiftIsoDate(otherMonday, 2),
    );

    const copyId = week.sessions[0].id;
    expect((await billAndPublish(coachA, otherPlanId)).status).toBe(200);

    // La preuve que l'athleteId dénormalisé est celui de la CIBLE : A2 lit la séance, A1 non.
    expect((await athleteA2.get(`/me/scheduled-sessions/${copyId}`)).status).toBe(200);
    expect((await athleteA1.get(`/me/scheduled-sessions/${copyId}`)).status).toBe(404);
  });

  it("refuse de coller dans un cycle DIFFUSÉ (409), sans rien y écrire", async () => {
    const before = await weekOf(coachA, livePlanId, liveWeekId);

    const res = await paste(coachA, liveWeekId, w1Id);
    expect(res.status).toBe(409);

    const after = await weekOf(coachA, livePlanId, liveWeekId);
    expect(after.sessions).toHaveLength(before.sessions.length);
    expect(after.sessions[0].id).toBe(before.sessions[0].id);
  });

  it("coller dans un brouillon n'émet AUCUNE notification à l'athlète", async () => {
    const before = (await athleteA1.get("/me/notifications")).body.length;

    expect((await paste(coachA, w3Id, w1Id)).status).toBe(201);

    expect((await athleteA1.get("/me/notifications")).body.length).toBe(before);
  });

  it("refuse une semaine source inconnue par un 400 — jamais un 404 qui confirmerait son id", async () => {
    // La semaine existe, mais chez un autre coach : indiscernable d'un id inventé.
    const foreign = await paste(coachA, w2Id, foreignWeekId);
    expect(foreign.status).toBe(400);

    const unknown = await paste(coachA, w2Id, "pw_inexistante");
    expect(unknown.status).toBe(400);
    expect(unknown.status).toBe(foreign.status);
  });

  it("refuse une semaine cible qui n'est pas la sienne (404)", async () => {
    expect((await paste(coachA, foreignWeekId, w1Id)).status).toBe(404);
  });

  it("refuse la copie d'une semaine sur elle-même", async () => {
    // Ce n'est pas un no-op : détruire puis recréer donnerait de nouveaux id aux séances.
    expect((await paste(coachA, w1Id, w1Id)).status).toBe(400);
  });

  it("refuse toute date proposée par le client (le schéma est strict)", async () => {
    const res = await coachA
      .post(`/plan-weeks/${w2Id}/copy-from`)
      .send({ sourcePlanWeekId: w1Id, scheduledDate: day(0) });
    expect(res.status).toBe(400);
  });

  it("la route reste fermée à l'athlète", async () => {
    expect((await athleteA1.post(`/plan-weeks/${w3Id}/copy-from`).send({})).status).toBe(403);
  });
});
