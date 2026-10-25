import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Role } from "@cmv/shared";
import { Client } from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { type Agent, billAndPublish, inviteFor, signUp } from "../support/actors";
import { app } from "../support/app";
import { mondayOfCurrentWeek } from "../support/fixtures";

const REPRISE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../prisma/migrations/20261025120100_reprise_blocs_de_seance/migration.sql",
);

/**
 * Rejoue la reprise telle que `prisma migrate deploy` l'applique : un fichier de plusieurs
 * instructions, `DO` compris, que seul le protocole simple de `pg` passe d'un envoi.
 */
async function replayReprise(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(readFileSync(REPRISE, "utf8"));
  } finally {
    await client.end();
  }
}

const reps = {
  id: "col_reps",
  source: "CATALOG",
  key: "REPETITIONS",
  unit: "REPS",
  label: null,
  collapsed: false,
};
const load = {
  id: "col_load",
  source: "CATALOG",
  key: "LOAD",
  unit: "KILOGRAMS_ADDED",
  label: " Lest ",
  collapsed: true,
};

describe("Reprise de l'ancien modèle dans les blocs de séance (#716)", () => {
  let coach: Agent;
  let athlete: Agent;
  let prisma: PrismaService;
  let tractionsId: string;
  let gainageId: string;
  let templateId: string;
  let scheduledId: string;
  let tractionsCopyId: string;

  const monday = mondayOfCurrentWeek();

  beforeAll(async () => {
    prisma = app.get(PrismaService);
    coach = await signUp("reprise-coach@cmv.test", Role.COACH);
    athlete = await signUp("reprise-athlete@cmv.test", Role.ATHLETE);
    const invitation = await inviteFor(coach, athlete);
    const accepted = await athlete.post(`/invitations/${invitation.body.id}/accept`);
    const athleteId = accepted.body[0].athleteId;

    const tractions = await coach.post("/exercises").send({
      title: "Tractions",
      tags: ["tirage"],
      blocks: [
        {
          id: "blk_series",
          label: "Force",
          structure: { type: "SERIES", setCount: 4, restBetweenSetsSeconds: 150 },
          metrics: [reps, load],
          // Une valeur vide se perd, une ligne de trop au-delà des séries aussi.
          rows: [
            { id: "r1", values: { col_reps: 6, col_load: null } },
            { id: "r2", values: { col_reps: 5 } },
            { id: "r3", values: { col_reps: 5 } },
            { id: "r4", values: { col_reps: 4 } },
            { id: "r5", values: { col_reps: 3 } },
          ],
        },
        {
          id: "blk_circuit",
          label: null,
          structure: { type: "CIRCUIT", roundCount: 3, restBetweenRoundsSeconds: 0 },
          metrics: [reps],
          rows: [
            { id: "c1", values: { col_reps: 10 } },
            { id: "c2", values: { col_reps: 8 } },
          ],
        },
      ],
    });
    expect(tractions.status).toBe(201);
    tractionsId = tractions.body.id;
    gainageId = (await coach.post("/exercises").send({ title: "Gainage" })).body.id;

    const template = await coach.post("/sessions").send({
      title: "Force",
      exercises: [{ exerciseId: tractionsId, note: "Épaule sensible" }, { exerciseId: gainageId }],
    });
    expect(template.status).toBe(201);
    templateId = template.body.id;

    const plan = await coach.post("/plans").send({
      athleteId,
      title: "Cycle reprise",
      startDate: monday,
      weeks: [{ type: "TRAINING" }],
    });
    const scheduled = await coach
      .post(`/plan-weeks/${plan.body.weeks[0].id}/sessions`)
      .send({ sourceSessionId: templateId, scheduledDate: monday });
    scheduledId = scheduled.body.id;
    tractionsCopyId = scheduled.body.exercises[0].id;
    expect((await billAndPublish(coach, plan.body.id)).status).toBe(200);

    // Une image de consigne, dont la copie doit suivre chaque entrée ajoutée.
    const image = await prisma.scheduledSessionExerciseDocument.create({
      data: {
        coachId: await coachIdOf(tractionsCopyId),
        athleteId,
        scheduledSessionExerciseId: tractionsCopyId,
        type: "FILE",
        usage: "INSTRUCTION",
        storagePath: "reprise/prise.jpg",
        url: null,
        fileName: "prise.jpg",
        mimeType: "image/jpeg",
      },
    });
    await prisma.scheduledSessionExercise.update({
      where: { id: tractionsCopyId },
      data: { instructions: [{ type: "IMAGE", mediaId: image.id, caption: null }] },
    });

    const sent = await athlete.put(`/me/scheduled-sessions/${scheduledId}/feedback`).send({
      content: null,
      tracking: {
        [tractionsCopyId]: { blk_series: { checked: [0, 2] }, blk_circuit: { checked: [1] } },
      },
    });
    expect(sent.status).toBe(200);

    await replayReprise();
  });

  async function coachIdOf(rowId: string): Promise<string> {
    return (await prisma.scheduledSessionExercise.findUniqueOrThrow({ where: { id: rowId } }))
      .coachId;
  }

  it("fait de chaque ancien bloc un bloc de séance, une entrée par étape d'un circuit", async () => {
    const read = await coach.get(`/sessions/${templateId}`);
    expect(read.status).toBe(200);
    const [series, circuit, free] = read.body.blocks;
    expect(read.body.blocks).toHaveLength(3);

    expect(series).toMatchObject({
      name: "Séries",
      label: "Force",
      sourcePreset: "SERIES",
      sourceStructureId: null,
      settings: {
        advance: { kind: "ATHLETE" },
        repeat: { kind: "ROUNDS", rounds: 4 },
        restBetweenRoundsSeconds: 150,
        restBetweenExercisesSeconds: null,
      },
    });
    expect(series.copiedSettings).toEqual(series.settings);
    expect(series.exercises).toEqual([
      {
        id: expect.any(String),
        key: expect.any(String),
        exerciseId: tractionsId,
        note: "Épaule sensible",
        grid: {
          metrics: [
            { id: "col_reps", source: "CATALOG", key: "REPETITIONS", unit: "REPS", label: null },
            {
              id: "col_load",
              source: "CATALOG",
              key: "LOAD",
              unit: "KILOGRAMS_ADDED",
              label: "Lest",
            },
          ],
          rows: [
            { id: "r1", values: { col_reps: 6 } },
            { id: "r2", values: { col_reps: 5 } },
            { id: "r3", values: { col_reps: 5 } },
            { id: "r4", values: { col_reps: 4 } },
          ],
        },
      },
    ]);

    // Un repos de 0 s n'est pas un repos.
    expect(circuit.settings).toMatchObject({
      repeat: { kind: "ROUNDS", rounds: 3 },
      restBetweenRoundsSeconds: null,
    });
    expect(circuit.exercises.map((exercise: { note: string | null }) => exercise.note)).toEqual([
      null,
      null,
    ]);
    expect(
      circuit.exercises.map(
        (exercise: { exerciseId: string; grid: { rows: unknown[] } }) => exercise.grid.rows,
      ),
    ).toEqual([[{ id: "c1", values: { col_reps: 10 } }], [{ id: "c2", values: { col_reps: 8 } }]]);

    // Un exercice sans bloc reste dans la séance, dans un bloc libre.
    expect(free).toMatchObject({
      name: "Libre",
      sourcePreset: "FREE",
      settings: { repeat: { kind: "ONCE" } },
      exercises: [{ exerciseId: gainageId, grid: { metrics: [], rows: [] } }],
    });
  });

  it("réindexe le suivi coché sur les cases du nouveau bloc, côté planifié", async () => {
    const read = await athlete.get(`/me/scheduled-sessions/${scheduledId}`);
    expect(read.status).toBe(200);
    const [series, circuit, free] = read.body.blocks;
    const [seriesKey] = series.exercises.map((exercise: { key: string }) => exercise.key);
    const circuitKeys = circuit.exercises.map((exercise: { key: string }) => exercise.key);

    expect(series.tracking).toEqual({
      checked: [
        { row: 0, key: seriesKey },
        { row: 2, key: seriesKey },
      ],
    });
    expect(circuit.tracking.checked).toHaveLength(2);
    expect(circuit.tracking.checked).toEqual(
      expect.arrayContaining(circuitKeys.map((key: string) => ({ row: 1, key }))),
    );
    // Gainage n'a jamais été suivi : NON SUIVI, pas « rien coché ».
    expect(free.tracking).toBeNull();

    for (const block of read.body.blocks) {
      for (const exercise of block.exercises) expect(exercise.origin).toEqual({ kind: "RECEIVED" });
    }
    expect(series.baseline).toEqual({
      settings: series.settings,
      exercises: [
        {
          key: seriesKey,
          exerciseId: tractionsId,
          note: "Épaule sensible",
          grid: series.exercises[0].grid,
        },
      ],
    });
  });

  it("recopie tags, documents et consigne sur chaque entrée ajoutée", async () => {
    const read = await athlete.get(`/me/scheduled-sessions/${scheduledId}`);
    const [, circuit] = read.body.blocks;
    const added = await prisma.scheduledSessionExercise.findUniqueOrThrow({
      where: { id: circuit.exercises[1].id },
      include: { documents: true, tags: true },
    });

    expect(added.tags.map((tag) => tag.name)).toEqual(["tirage"]);
    expect(added.documents).toHaveLength(1);
    const [copy] = added.documents;
    expect(copy?.storagePath).toBe("reprise/prise.jpg");
    expect(added.instructions).toEqual([{ type: "IMAGE", mediaId: copy?.id, caption: null }]);
  });

  it("suggère les colonnes des anciens blocs, sans doublon", async () => {
    const exercise = await prisma.exercise.findUniqueOrThrow({ where: { id: tractionsId } });
    expect(exercise.suggestedMetrics).toEqual([
      { source: "CATALOG", key: "REPETITIONS", unit: "REPS" },
      { source: "CATALOG", key: "LOAD", unit: "KILOGRAMS_ADDED" },
    ]);
  });

  it("se rejoue sans rien dupliquer", async () => {
    const before = await coach.get(`/sessions/${templateId}`);
    const scheduledBefore = await athlete.get(`/me/scheduled-sessions/${scheduledId}`);

    await replayReprise();

    expect((await coach.get(`/sessions/${templateId}`)).body.blocks).toEqual(before.body.blocks);
    expect((await athlete.get(`/me/scheduled-sessions/${scheduledId}`)).body.blocks).toEqual(
      scheduledBefore.body.blocks,
    );
  });
});
