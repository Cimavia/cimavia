import { ProblemType, Role, STRUCTURE_PRESETS, StructurePresetKey } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import {
  type Agent,
  billAndPublish,
  idOf,
  inviteFor,
  joinOrganization,
  signUp,
  signUpWith,
} from "../support/actors";
import { app } from "../support/app";
import { mondayOfCurrentWeek } from "../support/fixtures";
import { ANY_VERSION, atWeekVersion, deleteAtLatest, putAtLatest } from "../support/version";

const SERIES = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const FREE = STRUCTURE_PRESETS[StructurePresetKey.FREE];

const reps = { id: "col_reps", source: "CATALOG", key: "REPETITIONS", unit: "REPS", label: null };

const structureInput = (name: string) => ({
  name,
  tags: ["force"],
  note: "Note privée",
  instructions: "Tenir la position",
  settings: SERIES,
});

/** Un bloc de séance tel que l'éditeur l'envoie : réglages copiés, origine, exercices. */
function blockOf(
  exercises: { key: string; exerciseId: string; values?: Record<string, unknown> }[],
  origin: { sourceStructureId?: string | null; sourcePreset?: string | null } = {
    sourcePreset: StructurePresetKey.SERIES,
  },
) {
  return {
    id: `blk_${exercises[0]?.key}`,
    name: "Séries",
    label: null,
    instructions: null,
    settings: SERIES,
    copiedSettings: SERIES,
    sourceStructureId: origin.sourceStructureId ?? null,
    sourcePreset: origin.sourcePreset ?? null,
    exercises: exercises.map(({ key, exerciseId, values }) => ({
      key,
      exerciseId,
      note: null,
      grid: { metrics: [reps], rows: [{ id: `r_${key}`, values: values ?? { col_reps: 6 } }] },
    })),
  };
}

describe("Structures du Coach (#716)", () => {
  let coachA: Agent;
  let coachB: Agent;
  let athlete: Agent;
  let structureId: string;
  let exerciseId: string;

  beforeAll(async () => {
    coachA = await signUp("struct-coach-a@cmv.test", Role.COACH);
    coachB = await signUp("struct-coach-b@cmv.test", Role.COACH);
    athlete = await signUp("struct-athlete@cmv.test", Role.ATHLETE);
    exerciseId = (await coachA.post("/exercises").send({ title: "Tractions" })).body.id;
  });

  it("liste les structures prêtes dans leur ordre, à zéro séance", async () => {
    const library = await coachA.get("/structures");
    expect(library.status).toBe(200);
    expect(library.body).toEqual({
      presets: Object.values(StructurePresetKey).map((key) => ({ key, sessionCount: 0 })),
      structures: [],
    });
  });

  it("crée, relit et modifie une structure, sous sa version", async () => {
    const created = await coachA.post("/structures").send(structureInput("Pyramide"));
    expect(created.status).toBe(201);
    structureId = created.body.id;
    expect(created.body).toMatchObject({ name: "Pyramide", tags: ["force"], sessionCount: 0 });

    const updated = await putAtLatest(coachA, `/structures/${structureId}`, {
      ...structureInput("Pyramide inversée"),
      settings: FREE,
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: "Pyramide inversée", settings: FREE });

    const stale = await coachA
      .put(`/structures/${structureId}`)
      .send({ ...structureInput("Écrasée"), expectedUpdatedAt: ANY_VERSION });
    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
  });

  it("refuse des réglages grisés par les autres réponses", async () => {
    const res = await coachA.post("/structures").send({
      ...structureInput("Incohérente"),
      settings: { ...FREE, restBetweenRoundsSeconds: 60 },
    });
    expect(res.status).toBe(400);
  });

  it("compte les séances-types dont un bloc vient de la structure", async () => {
    const session = await coachA.post("/sessions").send({
      title: "Force",
      blocks: [
        blockOf([{ key: "a1", exerciseId }], { sourceStructureId: structureId }),
        blockOf([{ key: "b1", exerciseId }]),
        blockOf([{ key: "c1", exerciseId }]),
      ],
    });
    expect(session.status).toBe(201);

    const library = await coachA.get("/structures");
    expect(library.body.structures).toEqual([
      expect.objectContaining({ id: structureId, sessionCount: 1 }),
    ]);
    // Deux blocs de la même séance ne comptent qu'une séance.
    expect(library.body.presets).toContainEqual({ key: "SERIES", sessionCount: 1 });
  });

  it("n'expose rien à un autre Coach, ni à un athlète", async () => {
    expect((await coachB.get(`/structures/${structureId}`)).status).toBe(404);
    expect((await coachB.get("/structures")).body.structures).toEqual([]);
    expect(
      (
        await coachB
          .put(`/structures/${structureId}`)
          .send({ ...structureInput("Intrusion"), expectedUpdatedAt: ANY_VERSION })
      ).status,
    ).toBe(404);
    expect(
      (await coachB.delete(`/structures/${structureId}`).query({ expectedUpdatedAt: ANY_VERSION }))
        .status,
    ).toBe(404);
    expect((await athlete.get("/structures")).status).toBe(403);
  });

  it("refuse qu'un bloc cite la structure d'un autre Coach", async () => {
    const intruderExercise = (await coachB.post("/exercises").send({ title: "Gainage" })).body.id;
    const res = await coachB.post("/sessions").send({
      title: "Emprunt",
      blocks: [
        blockOf([{ key: "a1", exerciseId: intruderExercise }], { sourceStructureId: structureId }),
      ],
    });
    expect(res.status).toBe(400);
  });

  it("se supprime sans toucher les séances, qui en perdent l'origine", async () => {
    const deleted = await deleteAtLatest(coachA, `/structures/${structureId}`);
    expect(deleted.status).toBe(204);
    expect((await coachA.get(`/structures/${structureId}`)).status).toBe(404);

    const [session] = (await coachA.get("/sessions")).body;
    const read = await coachA.get(`/sessions/${session.id}`);
    expect(read.body.blocks[0]).toMatchObject({
      sourceStructureId: null,
      sourcePreset: null,
      settings: SERIES,
    });
  });
});

describe("Séances composées par blocs (#716)", () => {
  let coach: Agent;
  let otherCoach: Agent;
  let athlete: Agent;
  let athleteId: string;
  let tractionsId: string;
  let gainageId: string;
  let templateId: string;
  let planId: string;
  let weekIds: string[];
  let scheduledId: string;

  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    coach = await signUp("blocs-coach@cmv.test", Role.COACH);
    otherCoach = await signUp("blocs-other@cmv.test", Role.COACH);
    athlete = await signUp("blocs-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    athleteId = (await athlete.post(`/invitations/${invitation.body.id}/accept`)).body[0].athleteId;
    tractionsId = (await coach.post("/exercises").send({ title: "Tractions" })).body.id;
    gainageId = (await coach.post("/exercises").send({ title: "Gainage" })).body.id;
  });

  it("crée une séance par blocs et la relit, imbriquée", async () => {
    const created = await coach.post("/sessions").send({
      title: "Force",
      blocks: [
        blockOf([
          { key: "a1", exerciseId: tractionsId },
          { key: "a2", exerciseId: gainageId },
        ]),
      ],
    });
    expect(created.status).toBe(201);
    templateId = created.body.id;

    const [block] = created.body.blocks;
    // L'identifiant envoyé ne sert qu'à distinguer les blocs dans l'envoi.
    expect(block.id).not.toBe("blk_a1");
    expect(block.exercises.map((exercise: { key: string }) => exercise.key)).toEqual(["a1", "a2"]);
    expect(block.exercises[0]).toMatchObject({
      exerciseId: tractionsId,
      grid: { metrics: [reps], rows: [{ id: "r_a1", values: { col_reps: 6 } }] },
    });
  });

  it("refuse une composition par exercices ET par blocs", async () => {
    const res = await coach.post("/sessions").send({
      title: "Les deux",
      exercises: [{ exerciseId: tractionsId }],
      blocks: [blockOf([{ key: "a1", exerciseId: tractionsId }])],
    });
    expect(res.status).toBe(400);
  });

  it("refuse une cellule qui ne tient pas dans sa colonne, sans rien écrire", async () => {
    const res = await putAtLatest(coach, `/sessions/${templateId}`, {
      title: "Force",
      blocks: [blockOf([{ key: "a1", exerciseId: tractionsId, values: { col_reps: "lourd" } }])],
    });
    expect(res.status).toBe(400);
    expect((await coach.get(`/sessions/${templateId}`)).body.blocks[0].exercises).toHaveLength(2);
  });

  it("refuse l'exercice d'un autre Coach", async () => {
    const foreign = (await otherCoach.post("/exercises").send({ title: "Étranger" })).body.id;
    const res = await putAtLatest(coach, `/sessions/${templateId}`, {
      title: "Force",
      blocks: [blockOf([{ key: "a1", exerciseId: foreign }])],
    });
    expect(res.status).toBe(400);
  });

  it("efface les blocs quand la séance repasse par exercices, et inversement", async () => {
    const flat = await putAtLatest(coach, `/sessions/${templateId}`, {
      title: "Force",
      exercises: [{ exerciseId: tractionsId }],
    });
    expect(flat.status).toBe(200);
    expect(flat.body.blocks).toEqual([]);
    expect(flat.body.exercises).toHaveLength(1);

    const nested = await putAtLatest(coach, `/sessions/${templateId}`, {
      title: "Force",
      blocks: [
        blockOf([{ key: "a1", exerciseId: tractionsId }]),
        blockOf([{ key: "b1", exerciseId: gainageId }], { sourcePreset: "FREE" }),
      ],
    });
    expect(nested.status).toBe(200);
    expect(nested.body.blocks).toHaveLength(2);
    expect(nested.body.exercises).toHaveLength(2);
  });

  it("n'expose les blocs à personne d'autre", async () => {
    expect((await otherCoach.get(`/sessions/${templateId}`)).status).toBe(404);
  });

  it("diffuse les blocs : reçus, avec leur référence", async () => {
    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle blocs",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }],
    });
    planId = plan.body.id;
    weekIds = plan.body.weeks.map((week: { id: string }) => week.id);
    const scheduled = await coach
      .post(`/plan-weeks/${weekIds[0]}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: monday });
    expect(scheduled.status).toBe(201);
    scheduledId = scheduled.body.id;

    const template = (await coach.get(`/sessions/${templateId}`)).body;
    expect(scheduled.body.blocks).toHaveLength(2);
    scheduled.body.blocks.forEach((block: Record<string, unknown>, index: number) => {
      const source = template.blocks[index];
      expect(block).toMatchObject({
        name: source.name,
        settings: source.settings,
        copiedSettings: source.copiedSettings,
        sourcePreset: source.sourcePreset,
        tracking: null,
        baseline: {
          settings: source.settings,
          exercises: source.exercises.map((exercise: Record<string, unknown>) => ({
            key: exercise.key,
            exerciseId: exercise.exerciseId,
            note: exercise.note,
            grid: exercise.grid,
          })),
        },
      });
    });
    expect(scheduled.body.blocks[0].exercises[0]).toMatchObject({
      key: "a1",
      origin: { kind: "RECEIVED" },
      grid: template.blocks[0].exercises[0].grid,
    });
  });

  it("recopie les blocs avec la semaine", async () => {
    const copied = await coach
      .post(`/plan-weeks/${weekIds[1]}/copy-from`)
      .send(
        await atWeekVersion(coach, planId, weekIds[1] as string, { sourcePlanWeekId: weekIds[0] }),
      );
    expect(copied.status).toBe(201);

    const plan = await coach.get(`/plans/${planId}`);
    const [copy] = plan.body.weeks[1].sessions;
    const source = (await coach.get(`/scheduled-sessions/${scheduledId}`)).body;
    const detail = (await coach.get(`/scheduled-sessions/${copy.id}`)).body;
    const withoutIds = (blocks: { id: string; exercises: { id: string }[] }[]) =>
      blocks.map(({ id: _block, exercises, ...block }) => ({
        ...block,
        exercises: exercises.map(({ id: _row, ...exercise }) => exercise),
      }));
    expect(detail.blocks).toHaveLength(2);
    expect(detail.blocks[0].id).not.toBe(source.blocks[0].id);
    expect(withoutIds(detail.blocks)).toEqual(withoutIds(source.blocks));
  });

  it("l'athlète lit les blocs de sa séance, une fois diffusée", async () => {
    expect((await billAndPublish(coach, planId)).status).toBe(200);
    const read = await athlete.get(`/me/scheduled-sessions/${scheduledId}`);
    expect(read.status).toBe(200);
    expect(
      read.body.blocks.map((block: { exercises: unknown[] }) => block.exercises.length),
    ).toEqual([1, 1]);
  });

  describe("le suivi par bloc, avec le débrief", () => {
    let blockIds: string[];

    beforeAll(async () => {
      const read = await athlete.get(`/me/scheduled-sessions/${scheduledId}`);
      blockIds = read.body.blocks.map((block: { id: string }) => block.id);
    });

    const feedback = (blockTracking: object) =>
      athlete
        .put(`/me/scheduled-sessions/${scheduledId}/feedback`)
        .send({ content: null, blockTracking });

    it("refuse un bloc absent de la séance", async () => {
      const res = await feedback({ blk_inconnu: { checked: [] } });
      expect(res.status).toBe(400);
    });

    it("refuse une case que le bloc n'a pas", async () => {
      // Séries en 4 tours : il n'y a pas de 5e rangée, ni d'exercice « zz ».
      expect(
        (await feedback({ [blockIds[0] as string]: { checked: [{ row: 4, key: "a1" }] } })).status,
      ).toBe(400);
      expect(
        (await feedback({ [blockIds[0] as string]: { checked: [{ row: 0, key: "zz" }] } })).status,
      ).toBe(400);
    });

    it("écrit les cases cochées, et `null` remet le bloc à NON SUIVI", async () => {
      const [series, free] = blockIds as [string, string];
      const sent = await feedback({
        [series]: {
          checked: [
            { row: 0, key: "a1" },
            { row: 2, key: "a1" },
          ],
        },
        [free]: { checked: [] },
      });
      expect(sent.status).toBe(200);
      const read = await athlete.get(`/me/scheduled-sessions/${scheduledId}`);
      expect(read.body.blocks[0].tracking).toEqual({
        checked: [
          { row: 0, key: "a1" },
          { row: 2, key: "a1" },
        ],
      });
      expect(read.body.blocks[1].tracking).toEqual({ checked: [] });

      expect((await feedback({ [series]: null })).status).toBe(200);
      const reset = await athlete.get(`/me/scheduled-sessions/${scheduledId}`);
      expect(reset.body.blocks[0].tracking).toBeNull();
      // Un bloc que l'envoi ne cite pas garde son suivi.
      expect(reset.body.blocks[1].tracking).toEqual({ checked: [] });
    });

    it("le Coach lit le suivi, un autre athlète ne l'écrit pas", async () => {
      const read = await coach.get(`/scheduled-sessions/${scheduledId}`);
      expect(read.body.blocks[1].tracking).toEqual({ checked: [] });

      const intruder = await signUp("blocs-intruder@cmv.test", Role.ATHLETE);
      const res = await intruder
        .put(`/me/scheduled-sessions/${scheduledId}/feedback`)
        .send({ content: null, blockTracking: { [blockIds[0] as string]: { checked: [] } } });
      expect(res.status).toBe(404);
    });
  });
});

describe("Séance par blocs ouverte à un autre Coach (#605, #716)", () => {
  let c: Agent;
  let m: Agent;
  let prisma: PrismaService;
  let cId: string;
  let privateExerciseId: string;
  let structureId: string;
  let sessionId: string;

  beforeAll(async () => {
    prisma = app.get(PrismaService);
    const company = await signUpWith("blocs-share-f@cmv.test", {
      isCoach: false,
      isAthlete: false,
      isCompany: true,
    });
    c = await signUp("blocs-share-c@cmv.test", Role.COACH);
    m = await signUp("blocs-share-m@cmv.test", Role.COACH);
    await joinOrganization(company, c);
    await joinOrganization(company, m);
    const [organizationId, ownerId] = await Promise.all([idOf(company), idOf(c)]);
    cId = ownerId;

    // L'exercice reste privé : M ne le lit que dans la séance qui le cite.
    privateExerciseId = (await c.post("/exercises").send({ title: "Suspensions" })).body.id;
    structureId = (await c.post("/structures").send(structureInput("Paliers"))).body.id;
    const session = await c.post("/sessions").send({
      title: "Doigts",
      blocks: [
        blockOf([{ key: "a1", exerciseId: privateExerciseId }], { sourceStructureId: structureId }),
      ],
    });
    expect(session.status).toBe(201);
    sessionId = session.body.id;
    await prisma.accessGrant.create({
      data: { ownerId: cId, sessionId, organizationId, level: "WRITE" },
    });
  });

  it("M lit les blocs de la séance de C", async () => {
    const read = await m.get(`/sessions/${sessionId}`);
    expect(read.status).toBe(200);
    expect(read.body.blocks[0]).toMatchObject({
      sourceStructureId: structureId,
      exercises: [{ key: "a1", exerciseId: privateExerciseId }],
    });
  });

  it("M réenregistre ce que la séance cite déjà, et ses blocs restent chez C", async () => {
    const saved = await putAtLatest(m, `/sessions/${sessionId}`, {
      title: "Doigts",
      blocks: [
        blockOf([{ key: "a1", exerciseId: privateExerciseId, values: { col_reps: 8 } }], {
          sourceStructureId: structureId,
        }),
      ],
    });
    expect(saved.status).toBe(200);
    const blocks = await prisma.sessionBlock.findMany({ where: { sessionId } });
    expect(blocks.map((block) => block.coachId)).toEqual([cId]);
    const rows = await prisma.sessionExercise.findMany({ where: { sessionId } });
    expect(rows.map((row) => row.coachId)).toEqual([cId]);
  });

  it("M ne cite pas un exercice privé de C que la séance ne cite pas", async () => {
    const elsewhere = (await c.post("/exercises").send({ title: "Arqué" })).body.id;
    const res = await putAtLatest(m, `/sessions/${sessionId}`, {
      title: "Doigts",
      blocks: [blockOf([{ key: "a2", exerciseId: elsewhere }])],
    });
    expect(res.status).toBe(400);
  });

  it("le compteur de C compte la séance ; M ne voit pas la structure de C", async () => {
    const library = await c.get("/structures");
    expect(library.body.structures).toEqual([
      expect.objectContaining({ id: structureId, sessionCount: 1 }),
    ]);
    expect((await m.get(`/structures/${structureId}`)).status).toBe(404);
  });
});
