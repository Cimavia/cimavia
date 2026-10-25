import { describe, expect, it } from "vitest";
import { custom, gridOf, load, reps } from "../../test/block-fixtures";
import {
  blockGridSchema,
  GRID_MAX_METRICS,
  GRID_MAX_ROWS,
  metricsFromSuggested,
  suggestedMetricsSchema,
} from "./block-grid.schema";
import { MetricSource } from "./exercise-block.schema";
import { MetricKey, MetricUnit } from "./exercise-metric.schema";

const suggestedReps = {
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
};
const suggestedCustom = { source: MetricSource.CUSTOM, customMetricId: "metric_1" };

describe("suggestedMetricsSchema", () => {
  it("accepte des métriques sans valeur, du catalogue ou du Coach", () => {
    expect(suggestedMetricsSchema.safeParse([suggestedReps, suggestedCustom]).success).toBe(true);
  });

  it("refuse une unité que la métrique n'admet pas", () => {
    const wrong = { ...suggestedReps, unit: MetricUnit.KILOGRAMS };
    expect(suggestedMetricsSchema.safeParse([wrong]).success).toBe(false);
  });

  it("refuse deux fois la même métrique, même avec une autre unité", () => {
    const perSide = { ...suggestedReps, unit: MetricUnit.REPS_PER_SIDE };
    expect(suggestedMetricsSchema.safeParse([suggestedReps, perSide]).success).toBe(false);
    expect(suggestedMetricsSchema.safeParse([suggestedCustom, suggestedCustom]).success).toBe(
      false,
    );
  });

  it("borne le nombre de métriques", () => {
    const many = Array.from({ length: GRID_MAX_METRICS + 1 }, (_unused, index) => ({
      source: MetricSource.CUSTOM,
      customMetricId: `metric_${index}`,
    }));
    expect(suggestedMetricsSchema.safeParse(many).success).toBe(false);
  });
});

describe("metricsFromSuggested", () => {
  it("préremplit les colonnes dans l'ordre suggéré, sans libellé", () => {
    expect(
      metricsFromSuggested([suggestedReps, suggestedCustom], (index) => `col_${index}`),
    ).toEqual([
      { ...suggestedReps, id: "col_0", label: null },
      { ...suggestedCustom, id: "col_1", label: null },
    ]);
  });
});

describe("blockGridSchema", () => {
  it("accepte des cellules vides et une grille sans colonne", () => {
    expect(blockGridSchema.safeParse(gridOf([reps, load], [6, null], [6])).success).toBe(true);
    expect(blockGridSchema.safeParse(gridOf([])).success).toBe(true);
  });

  it("refuse une colonne à l'unité inadmise", () => {
    const wrong = { ...load, unit: MetricUnit.REPS };
    expect(blockGridSchema.safeParse(gridOf([wrong], [60])).success).toBe(false);
  });

  it("refuse des identifiants de colonne ou de ligne en double", () => {
    expect(blockGridSchema.safeParse(gridOf([reps, reps])).success).toBe(false);
    const grid = gridOf([reps], [6], [8]);
    const [first] = grid.rows;
    expect(blockGridSchema.safeParse({ ...grid, rows: [first, first] }).success).toBe(false);
  });

  it("refuse une valeur dont la colonne n'existe pas", () => {
    const grid = { metrics: [reps], rows: [{ id: "row_0", values: { col_gone: 6 } }] };
    expect(blockGridSchema.safeParse(grid).success).toBe(false);
  });

  it("borne les lignes au nombre de tours", () => {
    const rows = Array.from({ length: GRID_MAX_ROWS + 1 }, () => [6]);
    expect(blockGridSchema.safeParse(gridOf([custom], ...rows)).success).toBe(false);
  });
});
