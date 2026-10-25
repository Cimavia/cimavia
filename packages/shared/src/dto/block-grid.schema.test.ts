import { describe, expect, it } from "vitest";
import { custom, gridOf, issuesOf, load, reps } from "../../test/block-fixtures";
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

  it("accepte plusieurs métriques différentes, du catalogue comme du Coach", () => {
    const suggestedLoad = {
      source: MetricSource.CATALOG,
      key: MetricKey.LOAD,
      unit: MetricUnit.KILOGRAMS,
    };
    const otherCustom = { ...suggestedCustom, customMetricId: "metric_2" };
    expect(issuesOf(suggestedMetricsSchema, [suggestedReps, suggestedLoad])).toEqual([]);
    expect(issuesOf(suggestedMetricsSchema, [suggestedCustom, otherCustom])).toEqual([]);
  });

  it("refuse deux fois la même métrique, même avec une autre unité", () => {
    const twice = ": Un exercice ne peut pas suggérer deux fois la même métrique.";
    const perSide = { ...suggestedReps, unit: MetricUnit.REPS_PER_SIDE };
    expect(issuesOf(suggestedMetricsSchema, [suggestedReps, perSide])).toEqual([twice]);
    expect(issuesOf(suggestedMetricsSchema, [suggestedCustom, suggestedCustom])).toEqual([twice]);
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

  it("refuse un libellé de colonne fait d'espaces : sans libellé, c'est `null`", () => {
    expect(blockGridSchema.safeParse(gridOf([{ ...load, label: "   " }])).success).toBe(false);
    expect(blockGridSchema.parse(gridOf([{ ...load, label: " Voie " }])).metrics[0]?.label).toBe(
      "Voie",
    );
  });

  it("refuse une colonne à l'unité inadmise", () => {
    const wrong = { ...load, unit: MetricUnit.REPS };
    expect(issuesOf(blockGridSchema, gridOf([wrong], [60]))).toEqual([
      "metrics.0.unit: Cette unité n'est pas admise par la métrique.",
    ]);
  });

  it("refuse des identifiants de colonne ou de ligne en double", () => {
    expect(issuesOf(blockGridSchema, gridOf([reps, reps]))).toEqual([
      "metrics: Deux colonnes ne peuvent pas partager le même identifiant.",
    ]);
    const grid = gridOf([reps], [6], [8]);
    const [first] = grid.rows;
    expect(issuesOf(blockGridSchema, { ...grid, rows: [first, first] })).toEqual([
      "rows: Deux lignes ne peuvent pas partager le même identifiant.",
    ]);
  });

  it("refuse une valeur dont la colonne n'existe pas, même à côté de valeurs connues", () => {
    const values = { [reps.id]: 6, col_gone: 6 };
    expect(issuesOf(blockGridSchema, { metrics: [reps], rows: [{ id: "row_0", values }] })).toEqual(
      ["rows: Une ligne porte une valeur pour une colonne inexistante."],
    );
  });

  it("borne les lignes au nombre de tours", () => {
    const rows = Array.from({ length: GRID_MAX_ROWS + 1 }, () => [6]);
    expect(blockGridSchema.safeParse(gridOf([custom], ...rows)).success).toBe(false);
  });
});
