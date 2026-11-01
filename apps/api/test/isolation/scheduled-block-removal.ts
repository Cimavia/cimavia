import { CompositionEditKind, Role, STRUCTURE_PRESETS, StructurePresetKey } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, inviteFor, signUp } from "../support/actors";
import { mondayOfCurrentWeek } from "../support/fixtures";
import { atWeekVersion } from "../support/version";

const SERIES = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const reps = { id: "col_reps", source: "CATALOG", key: "REPETITIONS", unit: "REPS", label: null };

type Copy = {
  id: string;
  updatedAt: string;
  status: string;
  blocks: { id: string; settings: typeof SERIES; exercises: { key: string; grid: unknown }[] }[];
};

const versionOf = (copy: Copy) => ({ id: copy.id, expectedUpdatedAt: copy.updatedAt });
/** Les clés de chaque bloc d'une copie : `[]` pour un bloc retiré. */
const keysOf = (copy: Copy) => copy.blocks.map((block) => block.exercises.map(({ key }) => key));
const REMOVE_B = { kind: CompositionEditKind.REMOVE_BLOCK, blockIndex: 1 };

/** Un bloc de Séries de la séance-type, ses exercices à 6 répétitions. */
const blockOf = (id: string, exercises: { key: string; exerciseId: string }[]) => ({
  id,
  name: "Séries",
  label: null,
  instructions: null,
  settings: SERIES,
  copiedSettings: SERIES,
  sourceStructureId: null,
  sourcePreset: StructurePresetKey.SERIES,
  exercises: exercises.map(({ key, exerciseId }) => ({
    key,
    exerciseId,
    note: null,
    grid: { metrics: [reps], rows: [{ id: `r_${key}`, values: { col_reps: 6 } }] },
  })),
});

describe("Retrait d'un bloc d'une séance planifiée, pour les semaines choisies (#744)", () => {
  let coach: Agent;
  let otherCoach: Agent;
  let athlete: Agent;
  let planId: string;
  let anchorId: string;

  const monday = mondayOfCurrentWeek();

  async function copies(): Promise<Copy[]> {
    const res = await coach.get(`/scheduled-sessions/${anchorId}/copies`);
    expect(res.status).toBe(200);
    return res.body;
  }

  function compose(edit: Record<string, unknown>, apply: Copy[], revert: Copy[] = []) {
    return coach.post(`/scheduled-sessions/${anchorId}/composition`).send({
      edit,
      apply: apply.map(versionOf),
      revert: revert.map(versionOf),
    });
  }

  beforeAll(async () => {
    coach = await signUp("retrait-bloc-coach@cmv.test", Role.COACH);
    otherCoach = await signUp("retrait-bloc-other@cmv.test", Role.COACH);
    athlete = await signUp("retrait-bloc-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const athleteId = (await athlete.post(`/invitations/${invitation.body.id}/accept`)).body[0]
      .athleteId;
    const [tractions, gainage, dips] = await Promise.all(
      ["Tractions", "Gainage", "Dips"].map(
        async (title) => (await coach.post("/exercises").send({ title })).body.id as string,
      ),
    );

    const template = await coach.post("/sessions").send({
      title: "Force",
      blocks: [
        blockOf("blk_a", [{ key: "a1", exerciseId: tractions as string }]),
        blockOf("blk_b", [
          { key: "b1", exerciseId: gainage as string },
          { key: "b2", exerciseId: dips as string },
        ]),
      ],
    });
    expect(template.status).toBe(201);

    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle sans bloc",
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
    expect((await billAndPublish(coach, planId)).status).toBe(200);
  });

  it("retire le bloc sur les semaines cochées : il reste à son rang, vide", async () => {
    const [w1, w2] = await copies();
    const res = await compose(REMOVE_B, [w1 as Copy, w2 as Copy]);
    expect(res.status).toBe(200);
    expect(res.body.map(keysOf)).toEqual([
      [["a1"], []],
      [["a1"], []],
      [["a1"], ["b1", "b2"]],
    ]);
    expect(res.body[0].blocks[1].settings).toEqual(SERIES);
  });

  it("ne montre pas le bloc retiré à l'athlète, ni ne le compte dans la grille", async () => {
    const [w1] = await copies();
    const read = await athlete.get(`/me/scheduled-sessions/${(w1 as Copy).id}`);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ blockCount: 1, exerciseCount: 1 });
    expect(read.body.blocks.map((block: { id: string }) => block.id)).toEqual([w1?.blocks[0]?.id]);

    const grid = (await coach.get(`/plans/${planId}`)).body;
    expect(
      grid.weeks.map(
        (week: { sessions: { blockCount: number }[] }) => week.sessions[0]?.blockCount,
      ),
    ).toEqual([1, 1, 2]);
  });

  it("refuse de doser le bloc retiré", async () => {
    const [w1] = await copies();
    const copy = w1 as Copy;
    const res = await coach.post(`/scheduled-sessions/${anchorId}/values`).send({
      sessions: [
        {
          ...versionOf(copy),
          blocks: copy.blocks.map((block, index) => ({
            id: block.id,
            settings: index === 1 ? { ...SERIES, restBetweenRoundsSeconds: 30 } : block.settings,
            exercises: block.exercises.map(({ key, grid }) => ({ key, grid })),
          })),
        },
      ],
    });
    expect(res.status).toBe(400);
    expect((await copies())[0]?.updatedAt).toBe(copy.updatedAt);
  });

  it("refuse de retirer le dernier bloc, et n'écrit aucune semaine", async () => {
    const [w1, , w3] = await copies();
    const res = await compose({ ...REMOVE_B, blockIndex: 0 }, [w1 as Copy, w3 as Copy]);
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain("LAST_BLOCK");
    expect((await copies()).map(keysOf)).toEqual([
      [["a1"], []],
      [["a1"], []],
      [["a1"], ["b1", "b2"]],
    ]);
  });

  it("refuse de changer un exercice dans un bloc retiré", async () => {
    const [w1] = await copies();
    const res = await compose({ kind: CompositionEditKind.REMOVE, blockIndex: 1, key: "b1" }, [
      w1 as Copy,
    ]);
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain("BLOCK_REMOVED");
  });

  it("rend le bloc tel que la séance-type l'a donné, sur la semaine décochée seulement", async () => {
    const [, w2] = await copies();
    const res = await compose(REMOVE_B, [], [w2 as Copy]);
    expect(res.status).toBe(200);
    expect(res.body.map(keysOf)).toEqual([
      [["a1"], []],
      [["a1"], ["b1", "b2"]],
      [["a1"], ["b1", "b2"]],
    ]);
    const restored = (res.body[1] as Copy).blocks[1]?.exercises;
    expect(restored?.map(({ grid }) => grid)).toEqual(
      [1, 2].map((rank) => ({
        metrics: [reps],
        rows: [{ id: `r_b${rank}`, values: { col_reps: 6 } }],
      })),
    );
  });

  it("refuse un suivi sur le bloc retiré, et ne le compte pas au débrief", async () => {
    const [w1] = await copies();
    const [kept, removed] = (w1 as Copy).blocks;
    const send = (blockTracking: Record<string, unknown>) =>
      athlete
        .put(`/me/scheduled-sessions/${(w1 as Copy).id}/feedback`)
        .send({ content: "Fait.", blockTracking });

    const refused = await send({ [removed?.id as string]: { checked: [{ row: 0, key: "b1" }] } });
    expect(refused.status).toBe(400);

    expect(
      (await send({ [kept?.id as string]: { checked: [{ row: 0, key: "a1" }] } })).status,
    ).toBe(200);
    const feedback = await coach.get(`/scheduled-sessions/${(w1 as Copy).id}/feedback`);
    expect(feedback.body.trackedBlocks.map((block: { blockId: string }) => block.blockId)).toEqual([
      kept?.id,
    ]);
  });

  it("refuse une semaine débriefée, rendre comme retirer, sans rien écrire", async () => {
    const [done, w2] = await copies();
    expect(done).toMatchObject({ status: "DONE" });
    const restore = await compose(REMOVE_B, [], [done as Copy]);
    expect(restore.status).toBe(400);
    expect(restore.body.detail).toContain("DEBRIEFED");
    const remove = await compose(REMOVE_B, [w2 as Copy, done as Copy]);
    expect(remove.status).toBe(400);
    expect((await copies()).map(keysOf)).toEqual([
      [["a1"], []],
      [["a1"], ["b1", "b2"]],
      [["a1"], ["b1", "b2"]],
    ]);
  });

  it("n'ouvre pas le retrait d'un bloc à un autre Coach", async () => {
    const [, w2] = await copies();
    const foreign = await otherCoach.post(`/scheduled-sessions/${anchorId}/composition`).send({
      edit: REMOVE_B,
      apply: [versionOf(w2 as Copy)],
      revert: [],
    });
    expect(foreign.status).toBe(404);
    expect(keysOf((await copies())[1] as Copy)).toEqual([["a1"], ["b1", "b2"]]);
  });
});
