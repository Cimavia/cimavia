import { describe, expect, it } from "vitest";
import { issuesOf } from "../../test/block-fixtures";
import { GRID_MAX_METRICS } from "./block-grid.schema";
import { MetricSource } from "./exercise-block.schema";
import { MetricKey, MetricUnit } from "./exercise-metric.schema";
import { suggestedMetricIdentity, suggestedMetricsSchema } from "./suggested-metric.schema";

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

  it("borne le nombre de métriques à celui des colonnes d'une grille", () => {
    const many = Array.from({ length: GRID_MAX_METRICS + 1 }, (_unused, index) => ({
      source: MetricSource.CUSTOM,
      customMetricId: `metric_${index}`,
    }));
    expect(suggestedMetricsSchema.safeParse(many).success).toBe(false);
  });
});

describe("suggestedMetricIdentity", () => {
  it("ignore l'unité : « 8 répétitions » et « 8 par côté » sont la même colonne", () => {
    const perSide = { ...suggestedReps, unit: MetricUnit.REPS_PER_SIDE };
    expect(suggestedMetricIdentity(perSide)).toBe(suggestedMetricIdentity(suggestedReps));
  });

  it("distingue le catalogue d'une métrique du Coach, et deux métriques du Coach", () => {
    const otherCustom = { ...suggestedCustom, customMetricId: "metric_2" };
    const identities = [suggestedReps, suggestedCustom, otherCustom].map(suggestedMetricIdentity);
    expect(new Set(identities).size).toBe(3);
  });
});
