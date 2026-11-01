import { STRUCTURE_PRESETS, StructurePresetKey } from "@cmv/shared";

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
