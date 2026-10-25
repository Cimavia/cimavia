import { PLAN_MAX_WEEKS, ProblemType, Role, shiftIsoDate } from "@cmv/shared";
import type request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, link, required, signUp } from "../support/actors";
import { mondayOfCurrentWeek, uploadInstructionImage } from "../support/fixtures";
import {
  ANY_VERSION,
  atWeekVersion,
  deleteAtLatest,
  expectLocked,
  patchAtLatest,
  putAtLatest,
  versionOf,
  weekVersionOf,
} from "../support/version";

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
    expect(res.body.detail).toBe(`Un cycle ne peut pas dépasser ${PLAN_MAX_WEEKS} semaines`);
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

    const res = await coach
      .delete(`/plan-weeks/${week2.id}`)
      .query(await atWeekVersion(coach, plan.body.id, week2.id));

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

    const noted = await coach
      .patch(`/plan-weeks/${weekId}`)
      .send(await atWeekVersion(coach, plan.body.id, weekId, { note: "volume -30 %" }));
    expect(noted.status).toBe(200);
    expect(noted.body.weeks[0]).toMatchObject({ type: "DELOAD", note: "volume -30 %" });

    const typed = await coach
      .patch(`/plan-weeks/${weekId}`)
      .send(await atWeekVersion(coach, plan.body.id, weekId, { type: "TRAINING" }));
    expect(typed.body.weeks[0]).toMatchObject({ type: "TRAINING", note: "volume -30 %" });
  });

  it("la dernière semaine se retire sans rien renuméroter", async () => {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Fin",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "DELOAD" }],
    });

    const lastId = plan.body.weeks[1].id;
    const res = await coach
      .delete(`/plan-weeks/${lastId}`)
      .query(await atWeekVersion(coach, plan.body.id, lastId));

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

    const res = await coach
      .delete(`/plan-weeks/${week2.id}`)
      .query(await atWeekVersion(coach, plan.body.id, week2.id));

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain("diffusé");
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

    const res = await deleteAtLatest(coach, `/plans/${plan.body.id}`);

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain("diffusé");
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

  // Le collage cite la version de la semaine CIBLE (#604) : c'est elle qu'il écrase.
  async function paste(
    coach: Agent,
    [targetPlanId, targetWeekId]: [string, string],
    sourcePlanWeekId: string,
  ) {
    return coach
      .post(`/plan-weeks/${targetWeekId}/copy-from`)
      .send(await atWeekVersion(coach, targetPlanId, targetWeekId, { sourcePlanWeekId }));
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
    const res = await paste(coachA, [draftPlanId, w3Id], w1Id);
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

    expect((await paste(coachA, [plan.body.id, targetWeekId], sourceWeekId)).status).toBe(201);

    const target = await weekOf(coachA, plan.body.id, targetWeekId);
    const copied = await coachA.get(`/scheduled-sessions/${target.sessions[0].id}`);
    const line = copied.body.exercises[0];
    const mediaId = line.instructions[0].mediaId;
    expect(mediaId).not.toBe(sourceMediaId);
    expect(line.documents.map((d: { id: string }) => d.id)).toContain(mediaId);

    await deleteAtLatest(coachA, `/plans/${plan.body.id}`);
  });

  it("emporte le type et la note de la semaine, pas seulement ses séances", async () => {
    await coachA
      .patch(`/plan-weeks/${w1Id}`)
      .send(
        await atWeekVersion(coachA, draftPlanId, w1Id, { type: "DELOAD", note: "volume -40 %" }),
      );

    const res = await paste(coachA, [draftPlanId, w4Id], w1Id);
    expect(res.status).toBe(201);

    const week4 = res.body.weeks.find((w: { id: string }) => w.id === w4Id);
    expect(week4.type).toBe("DELOAD");
    expect(week4.note).toBe("volume -40 %");

    await coachA
      .patch(`/plan-weeks/${w1Id}`)
      .send(await atWeekVersion(coachA, draftPlanId, w1Id, { type: "TRAINING", note: null }));
  });

  it("une séance faite arrive PLANNED, et son débrief ne la suit pas", async () => {
    // La source est le cycle DIFFUSÉ : y lire ne le mute pas, et c'est le cas d'usage réel
    // (« reprendre le bloc du mois dernier »).
    const res = await paste(coachA, [draftPlanId, w2Id], liveWeekId);
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
    const res = await paste(coachA, [otherPlanId, otherWeekId], w1Id);
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

    const res = await paste(coachA, [livePlanId, liveWeekId], w1Id);
    expect(res.status).toBe(409);

    const after = await weekOf(coachA, livePlanId, liveWeekId);
    expect(after.sessions).toHaveLength(before.sessions.length);
    expect(after.sessions[0].id).toBe(before.sessions[0].id);
  });

  it("coller dans un brouillon n'émet AUCUNE notification à l'athlète", async () => {
    const before = (await athleteA1.get("/me/notifications")).body.length;

    expect((await paste(coachA, [draftPlanId, w3Id], w1Id)).status).toBe(201);

    expect((await athleteA1.get("/me/notifications")).body.length).toBe(before);
  });

  it("refuse une semaine source inconnue par un 400 — jamais un 404 qui confirmerait son id", async () => {
    // La semaine existe, mais chez un autre coach : indiscernable d'un id inventé.
    const foreign = await paste(coachA, [draftPlanId, w2Id], foreignWeekId);
    expect(foreign.status).toBe(400);

    const unknown = await paste(coachA, [draftPlanId, w2Id], "pw_inexistante");
    expect(unknown.status).toBe(400);
    expect(unknown.status).toBe(foreign.status);
  });

  it("refuse une semaine cible qui n'est pas la sienne (404)", async () => {
    // A ne lit pas la version de B : il en cite une bien formée, le 404 tombe avant de la comparer.
    const res = await coachA
      .post(`/plan-weeks/${foreignWeekId}/copy-from`)
      .send({ sourcePlanWeekId: w1Id, expectedUpdatedAt: ANY_VERSION });
    expect(res.status).toBe(404);
  });

  it("refuse la copie d'une semaine sur elle-même", async () => {
    // Ce n'est pas un no-op : détruire puis recréer donnerait de nouveaux id aux séances.
    expect((await paste(coachA, [draftPlanId, w1Id], w1Id)).status).toBe(400);
  });

  it("refuse toute date proposée par le client (le schéma est strict)", async () => {
    const res = await coachA.post(`/plan-weeks/${w2Id}/copy-from`).send(
      await atWeekVersion(coachA, draftPlanId, w2Id, {
        sourcePlanWeekId: w1Id,
        scheduledDate: day(0),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("la route reste fermée à l'athlète", async () => {
    expect((await athleteA1.post(`/plan-weeks/${w3Id}/copy-from`).send({})).status).toBe(403);
  });
});

/**
 * Les gestes sur une semaine refusent une grille périmée (#604) : deux Coachs d'une même entreprise
 * composent le même cycle, et un collage ou un glisser fondé sur ce que l'autre a changé depuis ne
 * défait plus son travail en silence. La version d'une semaine avance aussi quand ses SÉANCES
 * changent : c'est la grille qu'un geste réécrit, pas seulement le type et la note.
 */
describe("Semaine — version lue (#604)", () => {
  let coach: Agent;
  let other: Agent;
  let athlete: Agent;
  let athleteId: string;

  const monday = mondayOfCurrentWeek();

  type Grid = { planId: string; weekId: string; sourceWeekId: string; sessionIds: string[] };

  /** Un brouillon de deux semaines : la première porte deux séances le lundi, la seconde une. */
  async function grid(title: string): Promise<Grid> {
    const plan = await coach.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    const [weekId, sourceWeekId] = plan.body.weeks.map((w: { id: string }) => w.id);
    const sessionIds: string[] = [];
    for (const name of ["Lundi 1", "Lundi 2"]) {
      const session = await coach
        .post(`/plan-weeks/${weekId}/sessions`)
        .send({ title: name, scheduledDate: monday });
      sessionIds.push(session.body.id);
    }
    await coach
      .post(`/plan-weeks/${sourceWeekId}/sessions`)
      .send({ title: "Source", scheduledDate: shiftIsoDate(monday, 7) });
    return { planId: plan.body.id, weekId, sourceWeekId, sessionIds };
  }

  const planOf = async (g: Grid) => (await coach.get(`/plans/${g.planId}`)).body;
  const versionOfWeek = (g: Grid) => weekVersionOf(coach, g.planId, g.weekId);

  /** Un autre geste passe d'abord : la version lue avant lui est désormais périmée. */
  async function outpaced(g: Grid): Promise<string> {
    const read = await versionOfWeek(g);
    const note = await coach
      .patch(`/plan-weeks/${g.weekId}`)
      .send(await atWeekVersion(coach, g.planId, g.weekId, { note: "écrite par l'autre coach" }));
    expect(note.status).toBe(200);
    return read;
  }

  beforeAll(async () => {
    coach = await signUp("week-version-coach@cmv.test", Role.COACH);
    other = await signUp("week-version-other@cmv.test", Role.COACH);
    athlete = await signUp("week-version-athlete@cmv.test", Role.ATHLETE);
    athleteId = await link(coach, athlete);
  });

  it("la semaine expose sa version, et une retouche la fait avancer", async () => {
    const g = await grid("Avance");
    const before = await versionOfWeek(g);

    const write = await coach
      .patch(`/plan-weeks/${g.weekId}`)
      .send({ type: "DELOAD", expectedUpdatedAt: before });

    expect(write.status).toBe(200);
    const week = write.body.weeks.find((w: { id: string }) => w.id === g.weekId);
    expect(week.updatedAt).not.toBe(before);
    // La réponse porte la version de NOTRE écriture : celle que le prochain geste citera.
    expect(week.updatedAt).toBe(await versionOfWeek(g));
  });

  const gestures: [string, (g: Grid, expectedUpdatedAt: string) => request.Test][] = [
    [
      "la retouche du type",
      (g, expectedUpdatedAt) =>
        coach.patch(`/plan-weeks/${g.weekId}`).send({ type: "DELOAD", expectedUpdatedAt }),
    ],
    [
      "le collage",
      (g, expectedUpdatedAt) =>
        coach
          .post(`/plan-weeks/${g.weekId}/copy-from`)
          .send({ sourcePlanWeekId: g.sourceWeekId, expectedUpdatedAt }),
    ],
    [
      "le réordonnancement d'une journée",
      (g, expectedUpdatedAt) =>
        coach
          .put(`/plan-weeks/${g.weekId}/days/${monday}/order`)
          .send({ sessionIds: [...g.sessionIds].reverse(), expectedUpdatedAt }),
    ],
    [
      "le retrait",
      (g, expectedUpdatedAt) =>
        coach.delete(`/plan-weeks/${g.weekId}`).query({ expectedUpdatedAt }),
    ],
  ];

  it.each(
    gestures,
  )("refuse %s fondé sur une grille périmée, sans rien écrire", async (_, gesture) => {
    const g = await grid("Périmée");
    const read = await outpaced(g);
    const kept = await planOf(g);

    const stale = await gesture(g, read);

    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
    expect(await planOf(g)).toEqual(kept);
  });

  it.each(gestures)("refuse %s qui ne dit pas quelle version il a lue", async (_, gesture) => {
    const g = await grid("Sans version");
    const kept = await planOf(g);

    expect((await gesture(g, undefined as unknown as string)).status).toBe(400);
    expect(await planOf(g)).toEqual(kept);
  });

  /**
   * Le scénario de l'issue : le Coach 1 pose une séance, le Coach 2 glisse la journée telle qu'il
   * l'a vue. Sans avancée de la semaine, son ordre — qui ignore la séance posée — passerait.
   */
  it.each([
    [
      "posée",
      (g: Grid) =>
        coach
          .post(`/plan-weeks/${g.weekId}/sessions`)
          .send({ title: "Posée par l'autre", scheduledDate: monday }),
    ],
    [
      "retouchée",
      (g: Grid) =>
        putAtLatest(coach, `/scheduled-sessions/${g.sessionIds[0]}`, {
          title: "Retouchée",
          scheduledDate: monday,
          exercises: [],
        }),
    ],
    ["supprimée", (g: Grid) => deleteAtLatest(coach, `/scheduled-sessions/${g.sessionIds[0]}`)],
  ])("une séance %s fait avancer sa semaine", async (_, change) => {
    const g = await grid("Séances");
    const read = await versionOfWeek(g);

    expect((await change(g)).status).toBeLessThan(300);

    expect(await versionOfWeek(g)).not.toBe(read);
  });

  it("décaler la date du cycle fait avancer chacune de ses semaines", async () => {
    const g = await grid("Décalage");
    const before = (await planOf(g)).weeks.map((w: { updatedAt: string }) => w.updatedAt);

    const shifted = await patchAtLatest(coach, `/plans/${g.planId}`, {
      startDate: shiftIsoDate(monday, 7),
    });

    expect(shifted.status).toBe(200);
    const after = (await planOf(g)).weeks.map((w: { updatedAt: string }) => w.updatedAt);
    after.forEach((version: string, index: number) => {
      expect(version).not.toBe(before[index]);
    });
  });

  it("ne fait pas avancer la version d'une retouche qui ne change rien", async () => {
    const g = await grid("Rien");
    const before = await planOf(g);

    const write = await coach
      .patch(`/plan-weeks/${g.weekId}`)
      .send(await atWeekVersion(coach, g.planId, g.weekId));

    expect(write.status).toBe(200);
    expect(await planOf(g)).toEqual(before);
  });

  it("ne laisse passer qu'un geste sur deux lancés ensemble", async () => {
    const g = await grid("Course");
    const read = await versionOfWeek(g);
    const [first, second] = await Promise.all([
      coach.patch(`/plan-weeks/${g.weekId}`).send({ note: "A", expectedUpdatedAt: read }),
      coach.patch(`/plan-weeks/${g.weekId}`).send({ note: "B", expectedUpdatedAt: read }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  /**
   * Le conflit passe AVANT le verrou de diffusion : le geste n'a pas vu le cycle diffusé, et la
   * relecture le lui montrera — un refus « cycle diffusé » lui parlerait d'un état inconnu.
   */
  it("répond par un conflit de version sur un cycle diffusé depuis la lecture", async () => {
    const g = await grid("Diffusé entre-temps");
    const read = await outpaced(g);
    expect((await billAndPublish(coach, g.planId)).status).toBe(200);

    const stale = await coach.delete(`/plan-weeks/${g.weekId}`).query({ expectedUpdatedAt: read });

    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
  });

  // Le débrief raconte l'exécution, pas la composition : il ne doit pas périmer la grille du coach.
  it("le débrief de l'athlète ne fait pas avancer la semaine", async () => {
    const g = await grid("Débriefée");
    expect((await billAndPublish(coach, g.planId)).status).toBe(200);
    const read = await versionOfWeek(g);

    const feedback = await athlete
      .put(`/me/scheduled-sessions/${g.sessionIds[0]}/feedback`)
      .send({ content: "Faite." });

    expect(feedback.status).toBe(200);
    expect(await versionOfWeek(g)).toBe(read);
  });

  // Un 409 apprendrait à l'autre coach que la semaine existe.
  it("répond 404 à un autre coach, même muni de la dernière version", async () => {
    const g = await grid("Chez un autre");
    const kept = await planOf(g);

    const write = await other
      .patch(`/plan-weeks/${g.weekId}`)
      .send(await atWeekVersion(coach, g.planId, g.weekId, { note: "Intrusion" }));

    expect(write.status).toBe(404);
    expect(await planOf(g)).toEqual(kept);
  });

  it("répond 404 sur une semaine retirée, même munie de sa dernière version", async () => {
    const g = await grid("Retirée");
    const read = await versionOfWeek(g);
    expect(
      (await coach.delete(`/plan-weeks/${g.weekId}`).query({ expectedUpdatedAt: read })).status,
    ).toBe(200);

    const write = await coach
      .patch(`/plan-weeks/${g.weekId}`)
      .send({ note: "Trop tard", expectedUpdatedAt: read });

    expect(write.status).toBe(404);
  });

  /**
   * Les créations ne citent pas de version : deux semaines ajoutées au même instant visent le même
   * numéro, et l'unicité en refuse une — jamais un 500, jamais deux semaines au même numéro. Que
   * les requêtes se croisent ou non dépend du moment : seul l'invariant s'affirme.
   */
  it("deux semaines ajoutées ensemble : chacune son numéro, le refusé reçoit un 409", async () => {
    const g = await grid("Ajouts croisés");
    const added = await Promise.all(
      [1, 2, 3].map(() => coach.post(`/plans/${g.planId}/weeks`).send({ type: "TRAINING" })),
    );

    for (const res of added) expect([201, 409]).toContain(res.status);
    const numbers = (await planOf(g)).weeks.map((w: { weekNumber: number }) => w.weekNumber);
    expect(numbers).toEqual(numbers.map((_: number, index: number) => index + 1));
  });

  // Une séance verrouille d'abord sa semaine : posées au même instant, elles prennent leur rang
  // l'une après l'autre, et aucune n'est refusée.
  it("des séances posées ensemble le même jour prennent chacune leur rang", async () => {
    const g = await grid("Séances croisées");
    const created = await Promise.all(
      ["A", "B", "C"].map((title) =>
        coach.post(`/plan-weeks/${g.weekId}/sessions`).send({ title, scheduledDate: monday }),
      ),
    );

    expect(created.map((res) => res.status)).toEqual([201, 201, 201]);
    const week = (await planOf(g)).weeks.find((w: { id: string }) => w.id === g.weekId);
    expect(week.sessions.map((s: { position: number }) => s.position)).toEqual([0, 1, 2, 3, 4]);
  });
});

/**
 * L'édition d'une séance planifiée refuse une version périmée (#604) : deux Coachs ajustent la même
 * séance, et le second enregistrement ne défait plus le premier sans un mot. Le débrief de
 * l'athlète, lui, ne périme pas la séance du Coach.
 */
describe("Séance planifiée — version lue (#604)", () => {
  let coach: Agent;
  let other: Agent;
  let athlete: Agent;
  let athleteId: string;

  const monday = mondayOfCurrentWeek();
  const path = (sessionId: string) => `/scheduled-sessions/${sessionId}`;
  const edit = (title: string) => ({ title, scheduledDate: monday, exercises: [] });

  /** Un brouillon d'une semaine, une séance le lundi : rend son identifiant et son cycle. */
  async function scheduled(title: string): Promise<{ planId: string; sessionId: string }> {
    const plan = await coach.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    expect(plan.status).toBe(201);
    const session = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ title, scheduledDate: monday });
    expect(session.status).toBe(201);
    return { planId: plan.body.id, sessionId: session.body.id };
  }

  /** Un autre enregistrement passe d'abord : la version lue avant lui est désormais périmée. */
  async function outpaced(sessionId: string): Promise<string> {
    const read = await versionOf(coach, path(sessionId));
    expect((await putAtLatest(coach, path(sessionId), edit("Écrite par l'autre"))).status).toBe(
      200,
    );
    return read;
  }

  beforeAll(async () => {
    coach = await signUp("scheduled-version-coach@cmv.test", Role.COACH);
    other = await signUp("scheduled-version-other@cmv.test", Role.COACH);
    athlete = await signUp("scheduled-version-athlete@cmv.test", Role.ATHLETE);
    athleteId = await link(coach, athlete);
  });

  it("la réponse porte la version de NOTRE enregistrement", async () => {
    const { sessionId } = await scheduled("Avance");
    const before = await versionOf(coach, path(sessionId));

    const saved = await coach
      .put(path(sessionId))
      .send({ ...edit("Retouchée"), expectedUpdatedAt: before });

    expect(saved.status).toBe(200);
    expect(saved.body.updatedAt).not.toBe(before);
    expect(saved.body.updatedAt).toBe(await versionOf(coach, path(sessionId)));
  });

  type Write = (agent: Agent, sessionId: string, expectedUpdatedAt: string) => request.Test;
  const writes: [string, Write][] = [
    [
      "l'enregistrement",
      (agent, sessionId, expectedUpdatedAt) =>
        agent.put(path(sessionId)).send({ ...edit("Réécrite"), expectedUpdatedAt }),
    ],
    [
      "la suppression",
      (agent, sessionId, expectedUpdatedAt) =>
        agent.delete(path(sessionId)).query({ expectedUpdatedAt }),
    ],
  ];

  it.each(writes)("refuse %s fondé sur une séance périmée, sans rien écrire", async (_, write) => {
    const { sessionId } = await scheduled("Périmée");
    const read = await outpaced(sessionId);
    const kept = (await coach.get(path(sessionId))).body;

    const stale = await write(coach, sessionId, read);

    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
    expect((await coach.get(path(sessionId))).body).toEqual(kept);
  });

  it.each(writes)("refuse %s qui ne dit pas quelle version il a lue", async (_, write) => {
    const { sessionId } = await scheduled("Sans version");
    const kept = (await coach.get(path(sessionId))).body;

    expect((await write(coach, sessionId, undefined as unknown as string)).status).toBe(400);
    expect((await coach.get(path(sessionId))).body).toEqual(kept);
  });

  it("ne laisse passer qu'un enregistrement sur deux lancés ensemble", async () => {
    const { sessionId } = await scheduled("Course");
    const read = await versionOf(coach, path(sessionId));
    const [first, second] = await Promise.all(
      ["A", "B"].map((title) =>
        coach.put(path(sessionId)).send({ ...edit(title), expectedUpdatedAt: read }),
      ),
    );

    expect([first?.status, second?.status].sort()).toEqual([200, 409]);
  });

  // Le débrief raconte l'exécution, pas la composition : le Coach garde la main sur sa séance.
  it("l'enregistrement du coach avec la version d'avant le débrief passe", async () => {
    const { planId, sessionId } = await scheduled("Débriefée");
    expect((await billAndPublish(coach, planId)).status).toBe(200);
    const read = await versionOf(coach, path(sessionId));
    const feedback = await athlete
      .put(`/me/scheduled-sessions/${sessionId}/feedback`)
      .send({ content: "Faite." });
    expect(feedback.status).toBe(200);

    const saved = await coach
      .put(path(sessionId))
      .send({ ...edit("Ajustée après coup"), expectedUpdatedAt: read });

    expect(saved.status).toBe(200);
    expect(saved.body.status).toBe("DONE");
  });

  // Recharger n'y changerait rien : le motif durable passe avant le conflit de version.
  it("une séance débriefée refuse d'être supprimée pour ce motif, même citée périmée", async () => {
    const { planId, sessionId } = await scheduled("Débriefée puis retouchée");
    expect((await billAndPublish(coach, planId)).status).toBe(200);
    await athlete.put(`/me/scheduled-sessions/${sessionId}/feedback`).send({ content: "Faite." });
    const read = await outpaced(sessionId);

    const refused = await coach.delete(path(sessionId)).query({ expectedUpdatedAt: read });

    expectLocked(refused);
    expect(refused.body.detail).toContain("débriefée");
  });

  // Un 409 apprendrait à l'autre coach que la séance existe.
  it.each(
    writes,
  )("refuse %s d'un autre coach en 404, même muni de la dernière version", async (_, write) => {
    const { sessionId } = await scheduled("Chez un autre");
    const kept = (await coach.get(path(sessionId))).body;

    const intrusion = await write(other, sessionId, await versionOf(coach, path(sessionId)));

    expect(intrusion.status).toBe(404);
    expect((await coach.get(path(sessionId))).body).toEqual(kept);
  });

  it("répond 404 sur une séance supprimée, même munie de sa dernière version", async () => {
    const { sessionId } = await scheduled("Supprimée");
    const read = await versionOf(coach, path(sessionId));
    expect((await coach.delete(path(sessionId)).query({ expectedUpdatedAt: read })).status).toBe(
      204,
    );

    const write = await coach
      .put(path(sessionId))
      .send({ ...edit("Trop tard"), expectedUpdatedAt: read });

    expect(write.status).toBe(404);
  });
});
