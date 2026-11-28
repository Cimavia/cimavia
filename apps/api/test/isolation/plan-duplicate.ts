import { MyAccessLevel, PLAN_TITLE_MAX_LENGTH, Role, shiftIsoDate } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, link, required, signUp } from "../support/actors";
import { blocksOf } from "../support/blocks";
import { fromTemplate, mondayOfCurrentWeek } from "../support/fixtures";
import { grantPlan, type SharedPlanWorld, sharedPlanWorld } from "../support/plan-sharing";

type SessionRow = {
  id: string;
  title: string;
  scheduledDate: string;
  position: number;
  status: string;
};
type WeekRow = { id: string; type: string; note: string | null; sessions: SessionRow[] };

/**
 * Dupliquer un cycle (#5) : un brouillon neuf, au Coach qui duplique, sans athlète, qui commence le
 * lundi suivant la fin de sa source. Comptes `plan-dup-`.
 */
describe("Duplication d'une planification", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athleteA1: Agent;
  let exerciseId: string;
  let sourceId: string;
  let doneSessionId: string;

  const monday = mondayOfCurrentWeek();
  const day = (offset: number) =>
    required(shiftIsoDate(monday, offset) ?? undefined, `J+${offset}`);
  // La source dure trois semaines : la copie commence 21 jours plus tard.
  const SHIFT = 21;

  const duplicate = (coach: Agent, planId: string, title = "Cycle source (copie)") =>
    coach.post(`/plans/${planId}/duplicate`).send({ title });

  const byTitle = (weeks: WeekRow[], title: string) =>
    required(
      weeks.flatMap((week) => week.sessions).find((session) => session.title === title),
      `séance « ${title} »`,
    );

  beforeAll(async () => {
    coachA = await signUp("plan-dup-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("plan-dup-coach-b@cmv.test", Role.COACH);
    athleteA1 = await signUp("plan-dup-athlete-a1@cmv.test", Role.ATHLETE);
    const a1Id = await link(coachA, athleteA1);

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
      blocks: blocksOf({ exerciseId, note: "6×10 s" }),
    });

    const source = await coachA.post("/plans").send({
      athleteId: a1Id,
      title: "Cycle source",
      description: "Bloc force",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }, { type: "DELOAD", note: "volume -40 %" }],
    });
    sourceId = source.body.id;
    const [w1, , w3] = source.body.weeks.map((week: { id: string }) => week.id);

    // Semaine 1 : deux séances le lundi (rangs 0 et 1), une le mercredi ; semaine 3 : une le mardi.
    const done = await coachA
      .post(`/plan-weeks/${w1}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: day(0) });
    doneSessionId = done.body.id;
    for (const [weekId, title, date] of [
      [w1, "Renfo court", day(0)],
      [w1, "Voie", day(2)],
      [w3, "Décharge", day(15)],
    ] as const) {
      const res = await coachA
        .post(`/plan-weeks/${weekId}/sessions`)
        .send(await fromTemplate(coachA, { title, scheduledDate: date }));
      expect(res.status).toBe(201);
    }

    // Diffusé, facturé, une séance débriefée : rien de cela n'appartient à la composition.
    expect((await billAndPublish(coachA, sourceId)).status).toBe(200);
    const debrief = await athleteA1
      .put(`/me/scheduled-sessions/${doneSessionId}/feedback`)
      .send({ content: "Bonnes sensations." });
    expect(debrief.status).toBe(200);
  });

  it("crée un brouillon sans athlète, qui commence le lundi après la fin de la source", async () => {
    const res = await duplicate(coachA, sourceId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Cycle source (copie)",
      description: "Bloc force",
      status: "DRAFT",
      athleteId: null,
      startDate: day(SHIFT),
      myAccess: { level: MyAccessLevel.OWNER },
      grants: [],
    });
    expect(res.body.id).not.toBe(sourceId);

    const weeks: WeekRow[] = res.body.weeks;
    expect(weeks.map((week) => [week.type, week.note])).toEqual([
      ["TRAINING", null],
      ["TRAINING", null],
      ["DELOAD", "volume -40 %"],
    ]);
    expect(weeks.map((week) => week.sessions.length)).toEqual([3, 0, 1]);

    // Trois semaines plus loin : un lundi reste un lundi, et l'ordre du jour est recopié.
    expect(byTitle(weeks, "Doigts")).toMatchObject({ scheduledDate: day(SHIFT), position: 0 });
    expect(byTitle(weeks, "Renfo court")).toMatchObject({ scheduledDate: day(SHIFT), position: 1 });
    expect(byTitle(weeks, "Voie")).toMatchObject({ scheduledDate: day(SHIFT + 2), position: 0 });
    expect(byTitle(weeks, "Décharge")).toMatchObject({ scheduledDate: day(SHIFT + 15) });
  });

  it("emporte la composition en lignes neuves, sans l'exécution ni la facture", async () => {
    const copy = await duplicate(coachA, sourceId);
    const session = byTitle(copy.body.weeks, "Doigts");
    expect(session.id).not.toBe(doneSessionId);
    // Une séance débriefée arrive PLANNED : le statut décrit l'exécution de l'athlète.
    expect(session).toMatchObject({ status: "PLANNED" });

    const detail = await coachA.get(`/scheduled-sessions/${session.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.notes).toBe("Échauffement long.");
    expect(detail.body.blocks).toHaveLength(1);
    expect(detail.body.exercises).toHaveLength(1);
    expect(detail.body.exercises[0]).toMatchObject({
      sourceExerciseId: exerciseId,
      title: "Suspensions",
      note: "6×10 s",
      tags: ["grimpe"],
    });
    expect(detail.body.exercises[0].documents.map((d: { url: string }) => d.url)).toEqual([
      "https://youtu.be/hangboard",
    ]);

    const source = await coachA.get(`/scheduled-sessions/${doneSessionId}`);
    expect(detail.body.exercises[0].id).not.toBe(source.body.exercises[0].id);

    // Ni le débrief ni la facture ne suivent : une séance sans débrief rend `null`, pas un 404.
    const feedback = await coachA.get(`/scheduled-sessions/${session.id}/feedback`);
    expect(feedback.status).toBe(200);
    expect(feedback.body?.id).toBeUndefined();
    const billing = await coachA.get(`/plans/${copy.body.id}/billing`);
    expect(billing.status).toBe(200);
    expect(billing.body).toBeNull();
  });

  it("laisse la source intacte : diffusée, débriefée, facturée", async () => {
    await duplicate(coachA, sourceId);

    const source = await coachA.get(`/plans/${sourceId}`);
    expect(source.body).toMatchObject({ status: "PUBLISHED", startDate: monday });
    expect(byTitle(source.body.weeks, "Doigts")).toMatchObject({ status: "DONE" });
    const sourceFeedback = await coachA.get(`/scheduled-sessions/${doneSessionId}/feedback`);
    expect(sourceFeedback.body.content).toBe("Bonnes sensations.");
    // Sa facture est émise (une lecture de `/billing` rend `null` une fois diffusé) : la liste dit
    // qu'elle est seule, toutes les copies des tests précédents n'en ayant reçu aucune.
    const invoices = (await coachA.get("/invoices")).body as { planId: string | null }[];
    expect(invoices.map((invoice) => invoice.planId)).toEqual([sourceId]);
  });

  it("la copie n'existe pas pour l'athlète de la source", async () => {
    const copy = await duplicate(coachA, sourceId);
    const session = byTitle(copy.body.weeks, "Voie");
    // Sans athlète, aucune ligne de la copie ne satisfait son filtre : invisible par construction.
    expect((await athleteA1.get(`/me/scheduled-sessions/${session.id}`)).status).toBe(404);
  });

  it("refuse un titre vide ou trop long (400), sans rien créer", async () => {
    const before = (await coachA.get("/plans")).body.length;
    expect((await duplicate(coachA, sourceId, "")).status).toBe(400);
    expect((await duplicate(coachA, sourceId, "a".repeat(PLAN_TITLE_MAX_LENGTH + 1))).status).toBe(
      400,
    );
    expect((await coachA.get("/plans")).body.length).toBe(before);
  });

  it("le cycle d'un autre Coach, qui ne lui est pas ouvert, répond 404 sans rien créer", async () => {
    const res = await duplicate(coachB, sourceId);
    expect(res.status).toBe(404);
    expect((await coachB.get("/plans")).body).toEqual([]);
  });

  it("un athlète ne duplique rien (403)", async () => {
    expect((await duplicate(athleteA1, sourceId)).status).toBe(403);
  });

  it("une archive de suivi terminé se duplique : lire ne l'écrit pas", async () => {
    const athlete = await signUp("plan-dup-athlete-archive@cmv.test", Role.ATHLETE);
    const athleteId = await link(coachA, athlete);
    const plan = await coachA.post("/plans").send({
      athleteId,
      title: "Cycle archivé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    await coachA
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send(await fromTemplate(coachA, { title: "Dernière séance", scheduledDate: day(1) }));
    expect((await coachA.post(`/athletes/${athleteId}/end`)).status).toBe(200);

    const res = await duplicate(coachA, plan.body.id, "Cycle archivé (copie)");
    expect(res.status).toBe(201);
    // La copie n'hérite pas de l'archive : c'est un brouillon qu'on écrit.
    expect(res.body).toMatchObject({ athleteId: null, startDate: day(7), followEndedAt: null });
    expect(byTitle(res.body.weeks, "Dernière séance")).toMatchObject({ scheduledDate: day(8) });
  });
});

describe("Duplication d'un cycle ouvert par un autre Coach", () => {
  let world: SharedPlanWorld;

  beforeAll(async () => {
    world = await sharedPlanWorld("plan-dup-share");
  });

  it("en Lecture, M duplique le cycle de C : la copie est à M, et C ne la voit pas", async () => {
    await grantPlan(world, world.planTi.id, "READ");

    const res = await world.m
      .post(`/plans/${world.planTi.id}/duplicate`)
      .send({ title: "Cycle de TI (copie)" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      coachId: world.ids.m,
      athleteId: null,
      myAccess: { level: MyAccessLevel.OWNER },
    });
    expect(res.body.weeks.flatMap((week: WeekRow) => week.sessions)).toHaveLength(1);

    expect((await world.c.get(`/plans/${res.body.id}`)).status).toBe(404);
    // La source n'a pas bougé : M n'avait que la Lecture.
    expect((await world.c.get(`/plans/${world.planTi.id}`)).body.status).toBe("DRAFT");
  });

  it("fermé exprès (« Aucun »), le cycle de C répond 404 à M", async () => {
    await grantPlan(world, world.planTi.id, "NONE");

    const res = await world.m
      .post(`/plans/${world.planTi.id}/duplicate`)
      .send({ title: "Cycle de TI (copie)" });
    expect(res.status).toBe(404);
  });
});
