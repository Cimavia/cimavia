import { ProblemType, Role, STRUCTURE_PRESETS, StructurePresetKey } from "@cmv/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { type Agent, billAndPublish, inviteFor, signUp } from "../support/actors";
import { mondayOfCurrentWeek } from "../support/fixtures";
import { ANY_VERSION, atWeekVersion } from "../support/version";

const SERIES = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const load = { id: "col_load", source: "CATALOG", key: "LOAD", unit: "KILOGRAMS", label: null };

type Grid = { metrics: unknown[]; rows: { id: string; values: Record<string, unknown> }[] };
type Copy = {
  id: string;
  updatedAt: string;
  status: string;
  blocks: { id: string; settings: typeof SERIES; exercises: { key: string; grid: Grid }[] }[];
  exercises: { id: string; title: string; customMetrics: unknown[] }[];
};

const gridAt = (kg: number): Grid => ({
  metrics: [load],
  rows: [{ id: "r1", values: { col_load: kg } }],
});
const loadOf = (copy: Copy) => copy.blocks[0]?.exercises[0]?.grid.rows[0]?.values.col_load;

/** Ce que « Enregistrer » envoie d'une copie : ses blocs tels que lus, la grille de `a1` changée. */
function dosed(copy: Copy, grid: Grid, settings: unknown = copy.blocks[0]?.settings) {
  return {
    id: copy.id,
    expectedUpdatedAt: copy.updatedAt,
    blocks: copy.blocks.map((block) => ({
      id: block.id,
      settings,
      exercises: block.exercises.map((exercise) => ({
        key: exercise.key,
        grid: exercise.key === "a1" ? grid : exercise.grid,
      })),
    })),
  };
}

describe("Dosage d'une séance planifiée, semaine par semaine (#721)", () => {
  let coach: Agent;
  let otherCoach: Agent;
  let athlete: Agent;
  let templateId: string;
  let athleteId: string;
  let planId: string;
  let anchorId: string;
  let loneId: string;

  const monday = mondayOfCurrentWeek();

  async function copies(): Promise<Copy[]> {
    const res = await coach.get(`/scheduled-sessions/${anchorId}/copies`);
    expect(res.status).toBe(200);
    return res.body;
  }

  const save = (sessions: unknown[], agent: Agent = coach) =>
    agent.post(`/scheduled-sessions/${anchorId}/values`).send({ sessions });

  /** Un Plan de deux semaines, la séance-type posée en S1 et recopiée en S2. */
  async function planOf(
    title: string,
  ): Promise<{ id: string; anchorId: string; weekIds: string[] }> {
    const plan = await coach.post("/plans").send({
      athleteId,
      title,
      startDate: monday,
      weeks: [{ type: "TRAINING" }, { type: "TRAINING" }],
    });
    const weekIds: string[] = plan.body.weeks.map((week: { id: string }) => week.id);
    const anchor = await coach
      .post(`/plan-weeks/${weekIds[0]}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: monday });
    expect(anchor.status).toBe(201);
    const copied = await coach.post(`/plan-weeks/${weekIds[1]}/copy-from`).send(
      await atWeekVersion(coach, plan.body.id, weekIds[1] as string, {
        sourcePlanWeekId: weekIds[0],
      }),
    );
    expect(copied.status).toBe(201);
    return { id: plan.body.id, anchorId: anchor.body.id, weekIds };
  }

  beforeAll(async () => {
    coach = await signUp("cycle-dosage-coach@cmv.test", Role.COACH);
    otherCoach = await signUp("cycle-dosage-other@cmv.test", Role.COACH);
    athlete = await signUp("cycle-dosage-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    athleteId = (await athlete.post(`/invitations/${invitation.body.id}/accept`)).body[0].athleteId;
    const tractionsId = (await coach.post("/exercises").send({ title: "Tractions" })).body.id;

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
          exercises: [{ key: "a1", exerciseId: tractionsId, note: null, grid: gridAt(60) }],
        },
      ],
    });
    expect(template.status).toBe(201);
    templateId = template.body.id;

    const plan = await planOf("Cycle dosé");
    planId = plan.id;
    anchorId = plan.anchorId;
    const other = (await coach.post("/sessions").send({ title: "Souplesse" })).body.id;
    loneId = (
      await coach
        .post(`/plan-weeks/${plan.weekIds[0]}/sessions`)
        .send({ sourceSessionId: other, scheduledDate: monday })
    ).body.id;
  });

  it("donne à chaque copie le titre et les métriques figées de ses exercices", async () => {
    const [w1] = await copies();
    const row = w1?.blocks[0]?.exercises[0] as unknown as { id: string };
    expect(w1?.exercises).toEqual([{ id: row.id, title: "Tractions", customMetrics: [] }]);
  });

  it("enregistre les valeurs de plusieurs semaines en une fois, chacune les siennes", async () => {
    const [w1, w2] = (await copies()) as [Copy, Copy];
    const res = await save([
      dosed(w1, gridAt(70)),
      dosed(w2, gridAt(75), { ...SERIES, restBetweenRoundsSeconds: 90 }),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.map(loadOf)).toEqual([70, 75]);
    expect(res.body[1].blocks[0].settings.restBetweenRoundsSeconds).toBe(90);
    expect(res.body[0].blocks[0].settings).toEqual(SERIES);
    // La référence reste la séance-type reçue : c'est contre elle que Dosage montre l'écart.
    expect(res.body[0].blocks[0].baseline.exercises[0].grid).toEqual(gridAt(60));
    expect(res.body[0].updatedAt).not.toBe(w1.updatedAt);
  });

  it("répond 409 sur une semaine lue sous une version dépassée, sans rien écrire", async () => {
    const [w1, w2] = (await copies()) as [Copy, Copy];
    const res = await save([
      dosed(w1, gridAt(80)),
      dosed({ ...w2, updatedAt: ANY_VERSION }, gridAt(80)),
    ]);
    expect(res.status).toBe(409);
    expect(res.body.type).toBe(ProblemType.STALE_WRITE);
    expect((await copies()).map(loadOf)).toEqual([70, 75]);
  });

  it("n'écrit rien d'une semaine renvoyée telle quelle : ni version, ni annonce", async () => {
    const [w1] = (await copies()) as [Copy];
    const res = await save([dosed(w1, w1.blocks[0]?.exercises[0]?.grid as Grid)]);
    expect(res.status).toBe(200);
    expect(res.body[0].updatedAt).toBe(w1.updatedAt);
  });

  it("refuse une autre composition, une forme de réglages ou une valeur invalides", async () => {
    const [w1] = (await copies()) as [Copy];
    const renamed = dosed(w1, gridAt(80));
    renamed.blocks[0]?.exercises.push({ key: "x1", grid: gridAt(1) });
    expect((await save([renamed])).status).toBe(400);

    const once = { ...SERIES, repeat: { kind: "ONCE" }, restBetweenRoundsSeconds: null };
    expect((await save([dosed(w1, gridAt(80), once)])).status).toBe(400);

    const heavy = { ...gridAt(80), rows: [{ id: "r1", values: { col_load: "lourd" } }] };
    expect((await save([dosed(w1, heavy)])).status).toBe(400);
    expect((await copies())[0]?.updatedAt).toBe(w1.updatedAt);
  });

  it("refuse une séance qui n'est pas une copie de cette séance-type dans ce Plan", async () => {
    const lone = (await coach.get(`/scheduled-sessions/${loneId}`)).body;
    const res = await save([{ id: loneId, expectedUpdatedAt: lone.updatedAt, blocks: [] }]);
    expect(res.status).toBe(400);

    // La même séance-type, posée dans un autre Plan : ce n'est pas une copie de celui-ci.
    const elsewhere = await planOf("Autre cycle");
    const [foreign] = (await coach.get(`/scheduled-sessions/${elsewhere.anchorId}/copies`))
      .body as Copy[];
    const crossed = await save([dosed(foreign as Copy, gridAt(99))]);
    expect(crossed.status).toBe(400);
    expect(
      loadOf((await coach.get(`/scheduled-sessions/${elsewhere.anchorId}/copies`)).body[0]),
    ).toBe(60);
  });

  it("ne s'ouvre ni à un autre Coach ni à l'Athlete", async () => {
    const [w1] = (await copies()) as [Copy];
    expect((await save([dosed(w1, gridAt(1))], otherCoach)).status).toBe(404);
    expect((await save([dosed(w1, gridAt(1))], athlete)).status).toBe(403);
    expect(loadOf((await copies())[0] as Copy)).toBe(70);
  });

  // En dernier : diffuser le Plan et débriefer la S2 changent l'état que les tests d'avant lisent.
  it("diffusé, refuse une semaine débriefée et dose celle encore à faire", async () => {
    expect((await billAndPublish(coach, planId)).status).toBe(200);
    const [, w2] = (await copies()) as [Copy, Copy];
    const debriefed = await athlete
      .put(`/me/scheduled-sessions/${w2.id}/feedback`)
      .send({ content: "Fait." });
    expect(debriefed.status).toBe(200);

    const [w1, done] = (await copies()) as [Copy, Copy];
    expect(done.status).toBe("DONE");
    const refused = await save([dosed(w1, gridAt(85)), dosed(done, gridAt(85))]);
    expect(refused.status).toBe(400);
    expect(refused.body.detail).toContain("DEBRIEFED");
    expect((await copies()).map(loadOf)).toEqual([70, 75]);

    const res = await save([dosed(w1, gridAt(85))]);
    expect(res.status).toBe(200);
    expect(res.body.map(loadOf)).toEqual([85, 75]);
  });
});
