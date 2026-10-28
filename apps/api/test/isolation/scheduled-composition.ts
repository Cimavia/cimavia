import {
  CompositionEditKind,
  ProblemType,
  Role,
  STRUCTURE_PRESETS,
  StructurePresetKey,
} from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, inviteFor, signUp } from "../support/actors";
import { mondayOfCurrentWeek } from "../support/fixtures";
import { ANY_VERSION, atWeekVersion, putAtLatest } from "../support/version";

const SERIES = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const reps = { id: "col_reps", source: "CATALOG", key: "REPETITIONS", unit: "REPS", label: null };

type Copy = {
  id: string;
  updatedAt: string;
  blocks: {
    exercises: { id: string; key: string; grid: unknown; origin: Record<string, unknown> }[];
  }[];
};

const keysOf = (copy: Copy) => copy.blocks[0]?.exercises.map((exercise) => exercise.key);
const versionOf = (copy: Copy) => ({ id: copy.id, expectedUpdatedAt: copy.updatedAt });

describe("Composition d'une séance planifiée pour les semaines choisies (#720)", () => {
  let coach: Agent;
  let otherCoach: Agent;
  let athlete: Agent;
  let tractionsId: string;
  let gainageId: string;
  let dipsId: string;
  let planId: string;
  let anchorId: string;
  let loneId: string;

  const monday = mondayOfCurrentWeek();

  /** Les copies telles que le panneau les relit, dans l'ordre des semaines. */
  async function copies(): Promise<Copy[]> {
    const res = await coach.get(`/scheduled-sessions/${anchorId}/copies`);
    expect(res.status).toBe(200);
    return res.body;
  }

  /** L'exercice de la bibliothèque d'où vient la ligne `key` : le détail le porte, pas le bloc. */
  async function sourceOf(copy: Copy, key: string): Promise<string | null> {
    const row = copy.blocks[0]?.exercises.find((exercise) => exercise.key === key);
    const detail = (await coach.get(`/scheduled-sessions/${copy.id}`)).body;
    return (
      detail.exercises.find((exercise: { id: string }) => exercise.id === row?.id)
        ?.sourceExerciseId ?? null
    );
  }

  function compose(edit: Record<string, unknown>, apply: Copy[], revert: Copy[] = []) {
    return coach.post(`/scheduled-sessions/${anchorId}/composition`).send({
      edit,
      apply: apply.map(versionOf),
      revert: revert.map(versionOf),
    });
  }

  beforeAll(async () => {
    coach = await signUp("compo-coach@cmv.test", Role.COACH);
    otherCoach = await signUp("compo-other@cmv.test", Role.COACH);
    athlete = await signUp("compo-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const athleteId = (await athlete.post(`/invitations/${invitation.body.id}/accept`)).body[0]
      .athleteId;
    tractionsId = (await coach.post("/exercises").send({ title: "Tractions" })).body.id;
    gainageId = (await coach.post("/exercises").send({ title: "Gainage" })).body.id;
    dipsId = (await coach.post("/exercises").send({ title: "Dips" })).body.id;

    const template = await coach.post("/sessions").send({
      title: "Force",
      blocks: [
        {
          id: "blk_a",
          name: "Séries",
          label: null,
          instructions: null,
          settings: SERIES,
          copiedSettings: SERIES,
          sourceStructureId: null,
          sourcePreset: StructurePresetKey.SERIES,
          exercises: [
            { key: "a1", exerciseId: tractionsId },
            { key: "a2", exerciseId: gainageId },
          ].map(({ key, exerciseId }) => ({
            key,
            exerciseId,
            note: null,
            grid: { metrics: [reps], rows: [{ id: `r_${key}`, values: { col_reps: 6 } }] },
          })),
        },
      ],
    });
    expect(template.status).toBe(201);

    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle composé",
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }, { type: "TRAINING" }],
    });
    planId = plan.body.id;
    const weekIds: string[] = plan.body.weeks.map((week: { id: string }) => week.id);
    const anchor = await coach
      .post(`/plan-weeks/${weekIds[0]}/sessions`)
      .send({ sourceSessionId: template.body.id, scheduledDate: monday });
    expect(anchor.status).toBe(201);
    anchorId = anchor.body.id;
    for (const weekId of weekIds.slice(1)) {
      const copied = await coach
        .post(`/plan-weeks/${weekId}/copy-from`)
        .send(await atWeekVersion(coach, planId, weekId, { sourcePlanWeekId: weekIds[0] }));
      expect(copied.status).toBe(201);
    }

    // Une autre séance-type dans le même Plan : ce n'est pas une copie de la première.
    const other = (await coach.post("/sessions").send({ title: "Souplesse" })).body.id;
    loneId = (
      await coach
        .post(`/plan-weeks/${weekIds[0]}/sessions`)
        .send({ sourceSessionId: other, scheduledDate: monday })
    ).body.id;
  });

  it("compte les blocs de la séance dans la grille du Plan", async () => {
    const plan = (await coach.get(`/plans/${planId}`)).body;
    expect(plan.weeks[0].sessions).toContainEqual(
      expect.objectContaining({ id: anchorId, blockCount: 1, exerciseCount: 2 }),
    );
  });

  it("liste les copies de la séance-type dans le Plan, semaine après semaine", async () => {
    const listed = await copies();
    expect(listed).toHaveLength(3);
    expect(listed[0]?.id).toBe(anchorId);
    expect(listed.map(keysOf)).toEqual([
      ["a1", "a2"],
      ["a1", "a2"],
      ["a1", "a2"],
    ]);
  });

  it("ajoute un exercice sur les semaines cochées, sous la même clé", async () => {
    const [w1, w2] = await copies();
    const added = await compose(
      { kind: CompositionEditKind.ADD, blockIndex: 0, key: "x1", exerciseId: dipsId },
      [w1 as Copy, w2 as Copy],
    );
    expect(added.status).toBe(200);
    expect(added.body.map(keysOf)).toEqual([
      ["a1", "a2", "x1"],
      ["a1", "a2", "x1"],
      ["a1", "a2"],
    ]);
    expect(added.body[0].blocks[0].exercises[2]).toMatchObject({ origin: { kind: "ADDED" } });
    expect(await sourceOf(added.body[1], "x1")).toBe(dipsId);
    // Chaque copie écrite a changé de version ; la semaine non cochée garde la sienne.
    expect(added.body[0].updatedAt).not.toBe(w1?.updatedAt);
  });

  it("étend et retire le même ajout en un geste, sans toucher où il est déjà", async () => {
    const [w1, w2, w3] = await copies();
    const moved = await compose(
      { kind: CompositionEditKind.ADD, blockIndex: 0, key: "x1", exerciseId: dipsId },
      [w1 as Copy, w3 as Copy],
      [w2 as Copy],
    );
    expect(moved.status).toBe(200);
    expect(moved.body.map(keysOf)).toEqual([
      ["a1", "a2", "x1"],
      ["a1", "a2"],
      ["a1", "a2", "x1"],
    ]);
    expect(moved.body[0].updatedAt).toBe(w1?.updatedAt);
  });

  it("remplace un exercice reçu, puis le rend avec ses valeurs", async () => {
    const [, w2] = await copies();
    const received = (w2 as Copy).blocks[0]?.exercises[0];
    const edit = {
      kind: CompositionEditKind.REPLACE,
      blockIndex: 0,
      replacesKey: "a1",
      key: "r1",
      exerciseId: dipsId,
    };
    const replaced = await compose(edit, [w2 as Copy]);
    expect(replaced.status).toBe(200);
    expect(replaced.body[1].blocks[0].exercises[0]).toMatchObject({
      key: "r1",
      origin: { kind: "REPLACEMENT", replacesKey: "a1" },
    });

    expect(await sourceOf(replaced.body[1], "r1")).toBe(dipsId);

    const restored = await compose(edit, [], [replaced.body[1]]);
    expect(restored.status).toBe(200);
    expect(restored.body[1].blocks[0].exercises[0]).toMatchObject({
      key: "a1",
      origin: { kind: "RECEIVED" },
      grid: received?.grid,
    });
    expect(await sourceOf(restored.body[1], "a1")).toBe(tractionsId);
  });

  it("retire un exercice reçu, puis le rend à son rang", async () => {
    const [, w2] = await copies();
    const edit = { kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a1" };
    const removed = await compose(edit, [w2 as Copy]);
    expect(removed.status).toBe(200);
    expect(keysOf(removed.body[1])).toEqual(["a2"]);

    const restored = await compose(edit, [], [removed.body[1]]);
    expect(keysOf(restored.body[1])).toEqual(["a1", "a2"]);
  });

  it("refuse un geste qu'une semaine refuse, et n'écrit aucune semaine", async () => {
    const [w1, w2] = await copies();
    // « a1 » est une clé de la séance-type : un ajout ne la prend pas.
    const taken = await compose(
      { kind: CompositionEditKind.ADD, blockIndex: 0, key: "a1", exerciseId: dipsId },
      [w2 as Copy],
    );
    expect(taken.status).toBe(400);

    // La semaine 1 accepterait le retrait ; la semaine 2 ne le peut pas, il n'y resterait rien.
    await compose({ kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a2" }, [w2 as Copy]);
    const [w1b, w2b] = await copies();
    const last = await compose({ kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a1" }, [
      w1b as Copy,
      w2b as Copy,
    ]);
    expect(last.status).toBe(400);
    expect((await copies()).map(keysOf).slice(0, 2)).toEqual([["a1", "a2", "x1"], ["a1"]]);
    expect(w1?.updatedAt).toBe(w1b?.updatedAt);

    await compose(
      { kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a2" },
      [],
      [w2b as Copy],
    );
  });

  it("répond 409 sur une semaine lue sous une version dépassée, sans rien écrire", async () => {
    const [w1, w2] = await copies();
    const stale = await compose(
      { kind: CompositionEditKind.ADD, blockIndex: 0, key: "x2", exerciseId: gainageId },
      [w1 as Copy, { ...(w2 as Copy), updatedAt: ANY_VERSION }],
    );
    expect(stale.status).toBe(409);
    expect(stale.body.type).toBe(ProblemType.STALE_WRITE);
    expect(keysOf((await copies())[0] as Copy)).toEqual(["a1", "a2", "x1"]);
  });

  it("refuse une séance qui n'est pas une copie de cette séance-type", async () => {
    const lone = (await coach.get(`/scheduled-sessions/${loneId}`)).body;
    const res = await compose({ kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a1" }, [
      { id: loneId, updatedAt: lone.updatedAt, blocks: [] },
    ]);
    expect(res.status).toBe(400);
  });

  it("réinitialise la semaine du panneau à la séance-type reçue", async () => {
    const [w1] = await copies();
    const reset = await coach
      .post(`/scheduled-sessions/${anchorId}/composition/reset`)
      .send({ expectedUpdatedAt: w1?.updatedAt });
    expect(reset.status).toBe(200);
    expect(reset.body.map(keysOf)).toEqual([
      ["a1", "a2"],
      ["a1", "a2"],
      ["a1", "a2", "x1"],
    ]);

    const stale = await coach
      .post(`/scheduled-sessions/${anchorId}/composition/reset`)
      .send({ expectedUpdatedAt: ANY_VERSION });
    expect(stale.status).toBe(409);
  });

  it("enregistre titre et jour sans toucher à la composition", async () => {
    const [w1] = await copies();
    const saved = await putAtLatest(coach, `/scheduled-sessions/${anchorId}`, {
      title: "Force renommée",
      notes: "Échauffement long",
      scheduledDate: monday,
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ title: "Force renommée", notes: "Échauffement long" });
    const [after] = await copies();
    expect((after as Copy).blocks).toEqual((w1 as Copy).blocks);
  });

  it("n'ouvre ni les copies ni la composition à un autre Coach", async () => {
    const [w1] = await copies();
    expect((await otherCoach.get(`/scheduled-sessions/${anchorId}/copies`)).status).toBe(404);
    const foreign = await otherCoach.post(`/scheduled-sessions/${anchorId}/composition`).send({
      edit: { kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a1" },
      apply: [versionOf(w1 as Copy)],
      revert: [],
    });
    expect(foreign.status).toBe(404);
    const reset = await otherCoach
      .post(`/scheduled-sessions/${anchorId}/composition/reset`)
      .send({ expectedUpdatedAt: w1?.updatedAt });
    expect(reset.status).toBe(404);
    expect(keysOf((await copies())[0] as Copy)).toEqual(["a1", "a2"]);
  });

  it("refuse de placer l'exercice d'un autre Coach", async () => {
    const [w1] = await copies();
    const theirs = (await otherCoach.post("/exercises").send({ title: "Étranger" })).body.id;
    const res = await compose(
      { kind: CompositionEditKind.ADD, blockIndex: 0, key: "x3", exerciseId: theirs },
      [w1 as Copy],
    );
    expect(res.status).toBe(400);
    expect(keysOf((await copies())[0] as Copy)).toEqual(["a1", "a2"]);
  });

  // En dernier : diffuser le Plan et débriefer la S2 changent l'état que les tests d'avant lisent.
  it("refuse une semaine débriefée, et n'écrit aucune semaine", async () => {
    expect((await billAndPublish(coach, planId)).status).toBe(200);
    const [, w2] = await copies();
    const debriefed = await athlete
      .put(`/me/scheduled-sessions/${(w2 as Copy).id}/feedback`)
      .send({ content: "Fait." });
    expect(debriefed.status).toBe(200);

    const [w1, done] = await copies();
    expect(done).toMatchObject({ status: "DONE" });
    const res = await compose({ kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a2" }, [
      w1 as Copy,
      done as Copy,
    ]);
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain("DEBRIEFED");
    expect((await copies()).map(keysOf).slice(0, 2)).toEqual([
      keysOf(w1 as Copy),
      keysOf(done as Copy),
    ]);
  });

  it("diffusé, compose la semaine encore à faire ; un geste qui ne change rien n'écrit rien", async () => {
    const [w1] = await copies();
    const noop = await compose(
      { kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a2" },
      [],
      [w1 as Copy],
    );
    expect(noop.status).toBe(200);
    expect((await copies())[0]?.updatedAt).toBe(w1?.updatedAt);

    const res = await compose({ kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a2" }, [
      w1 as Copy,
    ]);
    expect(res.status).toBe(200);
    expect(keysOf((await copies())[0] as Copy)).toEqual(["a1"]);
  });
});
