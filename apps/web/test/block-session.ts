import {
  type BlockGrid,
  type GridMetric,
  MetricKey,
  MetricSource,
  MetricUnit,
  type ScheduledSessionBlockDto,
  type ScheduledSessionDto,
  type ScheduledSessionExerciseDto,
  type SessionBlockTracking,
  STRUCTURE_PRESETS,
  type StructureSettings,
} from "@cmv/shared";

// Une séance composée par blocs (#722), pour les tests de lecture et de suivi : chaque test ne dit
// que ce qui le distingue.

export const REPS: GridMetric = {
  id: "col_reps",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
};

/** Une grille de répétitions : une ligne par valeur. */
export function repsGrid(...values: (number | null)[]): BlockGrid {
  return {
    metrics: [REPS],
    rows: values.map((value, index) => ({
      id: `row_${index}`,
      values: value == null ? {} : { [REPS.id]: value },
    })),
  };
}

export function content(id: string, title: string): ScheduledSessionExerciseDto {
  return {
    id,
    sourceExerciseId: null,
    title,
    description: null,
    instructions: null,
    tracking: null,
    tags: [],
    note: null,
    blocks: [],
    customMetrics: [],
    baseline: [],
    adjustments: [],
    baselineAdjustments: [],
    position: 0,
    documents: [],
  } as unknown as ScheduledSessionExerciseDto;
}

type BlockInput = {
  id: string;
  name?: string;
  label?: string | null;
  instructions?: string | null;
  settings?: StructureSettings;
  tracking?: SessionBlockTracking | null;
  /** `[contenu, clé, grille]` de chaque exercice, dans l'ordre. */
  exercises: [string, string, BlockGrid?][];
};

export function block(input: BlockInput): ScheduledSessionBlockDto {
  const settings = input.settings ?? STRUCTURE_PRESETS.SERIES;
  return {
    id: input.id,
    name: input.name ?? "Séries",
    label: input.label ?? null,
    instructions: input.instructions ?? null,
    settings,
    copiedSettings: settings,
    sourceStructureId: null,
    sourcePreset: null,
    baseline: { settings, exercises: [] },
    tracking: input.tracking ?? null,
    exercises: input.exercises.map(([id, key, grid]) => ({
      id,
      key,
      note: null,
      grid: grid ?? repsGrid(),
      origin: { kind: "RECEIVED" },
    })),
  } as unknown as ScheduledSessionBlockDto;
}

/**
 * Trois blocs : des Séries à un exercice (1), un AMRAP à libellé (« Finisher »), un Tabata à deux
 * exercices (2). Le contenu de chaque exercice vit dans `exercises`, sous le même identifiant.
 */
export function blockSession(over: Partial<ScheduledSessionDto> = {}): ScheduledSessionDto {
  return {
    id: "s-1",
    planId: "p-1",
    title: "Force & conditionnement",
    notes: null,
    scheduledDate: "2026-10-14",
    status: "PLANNED",
    coachId: "coach-1",
    coachName: "Léa Moreau",
    exercises: [content("sx-1", "Squat"), content("sx-2", "Tractions"), content("sx-3", "Gainage")],
    blocks: [
      block({ id: "blk-1", exercises: [["sx-1", "a1", repsGrid(8, 6)]] }),
      block({
        id: "blk-2",
        name: "AMRAP",
        label: "Finisher",
        settings: STRUCTURE_PRESETS.AMRAP,
        exercises: [["sx-3", "b1"]],
      }),
      block({
        id: "blk-3",
        name: "Tabata",
        settings: STRUCTURE_PRESETS.TABATA,
        exercises: [
          ["sx-2", "c1"],
          ["sx-1", "c2"],
        ],
      }),
    ],
    ...over,
  } as unknown as ScheduledSessionDto;
}
