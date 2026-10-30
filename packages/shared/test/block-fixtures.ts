import type { z } from "zod";
import type { BlockGrid, GridMetric } from "../src/dto/block-grid.schema";
import { MetricSource } from "../src/dto/exercise-block.schema";
import { MetricKey, MetricUnit, type MetricValue } from "../src/dto/exercise-metric.schema";
import { STRUCTURE_PRESETS, type StructureSettings } from "../src/dto/structure.schema";
import {
  StructureAdvance,
  StructureOrder,
  StructureRepeat,
} from "../src/dto/structure-answer.schema";

// Les briques des tests de blocs (#715), pour que chaque test ne dise que ce qui le distingue.

/** Des Séries de 4 tours, sans repos : chaque test change ce qu'il éprouve. */
export function settingsOf(overrides: Partial<StructureSettings> = {}): StructureSettings {
  return {
    advance: { kind: StructureAdvance.ATHLETE },
    repeat: { kind: StructureRepeat.ROUNDS, rounds: 4 },
    restBetweenExercisesSeconds: null,
    restBetweenRoundsSeconds: null,
    limitSeconds: null,
    order: StructureOrder.ALL,
    ...overrides,
  };
}

export const beep = (everySeconds: number) =>
  ({ kind: StructureAdvance.BEEP, everySeconds }) as const;
export const cycle = (workSeconds: number, restSeconds: number) =>
  ({ kind: StructureAdvance.CYCLE, workSeconds, restSeconds }) as const;
export const rounds = (count: number) => ({ kind: StructureRepeat.ROUNDS, rounds: count }) as const;
export const asMuchAsPossible = (capSeconds: number) =>
  ({ kind: StructureRepeat.MAX, capSeconds }) as const;
export const once = { kind: StructureRepeat.ONCE } as const;

/** « Un seul par bip », toutes les `everySeconds`, `count` bips. */
export const oneByBeep = (everySeconds: number, count: number): StructureSettings =>
  settingsOf({ advance: beep(everySeconds), repeat: rounds(count), order: StructureOrder.ONE });

export const presets = STRUCTURE_PRESETS;

export const reps: GridMetric = {
  id: "col_reps",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
};
export const load: GridMetric = {
  id: "col_load",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.LOAD,
  unit: MetricUnit.KILOGRAMS,
};
export const effort: GridMetric = {
  id: "col_effort",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.EFFORT_DURATION,
  unit: MetricUnit.NONE,
};
export const setRest: GridMetric = {
  id: "col_set_rest",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.REST_BETWEEN_SETS,
  unit: MetricUnit.NONE,
};
export const roundRest: GridMetric = {
  id: "col_round_rest",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.REST_BETWEEN_ROUNDS,
  unit: MetricUnit.NONE,
};
export const custom: GridMetric = {
  id: "col_custom",
  label: null,
  source: MetricSource.CUSTOM,
  customMetricId: "metric_1",
};

/** Une grille : ses colonnes, puis une ligne par tableau de valeurs, dans l'ordre des colonnes. */
export function gridOf(metrics: GridMetric[], ...rows: MetricValue[][]): BlockGrid {
  return {
    metrics,
    rows: rows.map((values, index) => ({
      id: `row_${index}`,
      values: Object.fromEntries(
        metrics.flatMap((metric, column) => {
          const value = values[column];
          return value === undefined ? [] : [[metric.id, value]];
        }),
      ),
    })),
  };
}

/**
 * Les refus d'un schéma, « chemin: message » : un test qui les nomme tient aussi leur texte. Un
 * refus qui n'est pas un refus métier (`custom`) porte en plus son code, « [too_big] ».
 */
export function issuesOf(schema: z.ZodType, input: unknown): string[] {
  const parsed = schema.safeParse(input);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => {
    const text = `${issue.path.join(".")}: ${issue.message}`;
    return issue.code === "custom" ? text : `${text} [${issue.code}]`;
  });
}
