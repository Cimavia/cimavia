import {
  METRIC_TEXT_VALUE_MAX_LENGTH,
  STRUCTURE_PRESETS,
  StructurePresetKey,
  TRAINING_DURATION_MAX_SECONDS,
} from "@cmv/shared";

/**
 * La composition par blocs telle que l'éditeur l'envoie (#716) : depuis #723, une séance-type ne se
 * compose plus autrement, et une séance planifiée n'est jamais que la copie d'une séance-type.
 */

export const SERIES = STRUCTURE_PRESETS[StructurePresetKey.SERIES];

export const REPS = {
  id: "col_reps",
  source: "CATALOG",
  key: "REPETITIONS",
  unit: "REPS",
  label: null,
};

export type GridInput = {
  metrics: unknown[];
  rows: { id: string; values: Record<string, unknown> }[];
};

export type BlockExerciseInput = {
  key: string;
  exerciseId: string;
  note?: string | null;
  grid?: GridInput;
};

/** Une grille d'une ligne, en répétitions. */
export const repsGrid = (key: string, reps = 6): GridInput => ({
  metrics: [REPS],
  rows: [{ id: `r_${key}`, values: { col_reps: reps } }],
});

export const textOf = (length: number) => "x".repeat(length);

const singleUnitColumn = (id: string, key: string) => ({
  id,
  source: "CATALOG",
  key,
  unit: "NONE",
  label: null,
});

/** Une ligne d'une grille à durée, cotation et texte : les types qu'une cellule peut enfreindre. */
export const cellsGrid = (values: Record<string, unknown>): GridInput => ({
  metrics: [
    singleUnitColumn("col_effort", "EFFORT_DURATION"),
    singleUnitColumn("col_grade", "GRADE"),
    singleUnitColumn("col_pace", "PACE"),
  ],
  rows: [{ id: "r1", values }],
});

/** Chaque type à sa limite : sans ce témoin, un refus des colonnes passerait pour celui des valeurs. */
export const VALID_CELLS = {
  col_effort: TRAINING_DURATION_MAX_SECONDS,
  col_grade: "6a",
  col_pace: textOf(METRIC_TEXT_VALUE_MAX_LENGTH),
};

/** Ce que l'API refuse dans une cellule, sur toute route qui reçoit une grille (#323). */
export const REFUSED_CELLS: [string, Record<string, unknown>][] = [
  ["une durée négative", { col_effort: -5 }],
  ["une durée au-delà de 24 h", { col_effort: TRAINING_DURATION_MAX_SECONDS + 1 }],
  ["un palier hors de l'échelle", { col_grade: "palier-fantome" }],
  ["un texte trop long", { col_pace: textOf(METRIC_TEXT_VALUE_MAX_LENGTH + 1) }],
  ["une valeur sans colonne", { col_gone: 6 }],
];

/** Un bloc « Séries », réglages copiés de la structure prête. */
export function seriesBlock(
  exercises: readonly BlockExerciseInput[],
  id = `blk_${exercises[0]?.key ?? "vide"}`,
) {
  return {
    id,
    name: "Séries",
    label: null,
    instructions: null,
    settings: SERIES,
    copiedSettings: SERIES,
    sourceStructureId: null,
    sourcePreset: StructurePresetKey.SERIES,
    exercises: exercises.map(({ key, exerciseId, note, grid }) => ({
      key,
      exerciseId,
      note: note ?? null,
      grid: grid ?? repsGrid(key),
    })),
  };
}

/** Un bloc unique qui compose ces exercices dans l'ordre, sous les clés `a1`, `a2`… */
export function blocksOf(...exercises: (string | Omit<BlockExerciseInput, "key">)[]) {
  return [
    seriesBlock(
      exercises.map((exercise, index) => ({
        key: `a${index + 1}`,
        ...(typeof exercise === "string" ? { exerciseId: exercise } : exercise),
      })),
    ),
  ];
}
