import { describe, expect, it } from "vitest";
import { custom, gridOf, issuesOf, load, reps } from "../../test/block-fixtures";
import {
  blockGridSchema,
  GRID_MAX_METRICS,
  GRID_MAX_ROWS,
  metricsFromSuggested,
  sameGridMetrics,
  suggestedMetricsSchema,
} from "./block-grid.schema";
import { customMetricIdsIn, gridValueIssues, MetricSource } from "./exercise-block.schema";
import { MetricKey, MetricUnit, MetricValueType } from "./exercise-metric.schema";

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

  it("refuse à sa cellule une valeur dont la colonne n'existe pas, même à côté de valeurs connues", () => {
    const rows = [
      { id: "row_0", values: { [reps.id]: 6 } },
      { id: "row_1", values: { [reps.id]: 6, col_gone: 6 } },
    ];
    expect(issuesOf(blockGridSchema, { metrics: [reps], rows })).toEqual([
      "rows.1.values.col_gone: Une ligne porte une valeur pour une colonne inexistante.",
    ]);
  });

  it("borne les lignes au nombre de tours", () => {
    const rows = Array.from({ length: GRID_MAX_ROWS + 1 }, () => [6]);
    expect(blockGridSchema.safeParse(gridOf([custom], ...rows)).success).toBe(false);
  });
});

describe("gridValueIssues", () => {
  const scale = {
    id: "metric_1",
    label: "Cotation maison",
    unit: null,
    valueType: MetricValueType.SCALE,
    scale: ["1", "2", "3"],
  };

  it("ne signale rien quand chaque cellule tient dans le type de sa colonne", () => {
    expect(gridValueIssues(gridOf([reps, load], [6, 12], [6, null]), [])).toEqual([]);
  });

  it("signale à sa cellule du texte dans une colonne numérique", () => {
    expect(gridValueIssues(gridOf([reps], [6], ["beaucoup"]), [])).toEqual([
      { rowId: "row_1", metricId: reps.id, message: expect.any(String) },
    ]);
  });

  it("lit le type et l'échelle d'une colonne du Coach dans ses métriques", () => {
    expect(gridValueIssues(gridOf([custom], ["2"], ["9"]), [scale])).toEqual([
      {
        rowId: "row_1",
        metricId: custom.id,
        message: "Ce palier n'appartient pas à l'échelle de la colonne.",
      },
    ]);
  });

  it("signale une seule fois, pour toute la colonne, une métrique du Coach introuvable", () => {
    expect(gridValueIssues(gridOf([custom], ["2"], ["3"]), [])).toEqual([
      {
        rowId: "",
        metricId: custom.id,
        message: "Cette colonne référence une métrique introuvable.",
      },
    ]);
  });
});

describe("customMetricIdsIn sur des grilles (#716)", () => {
  it("ne garde que les métriques du Coach, une fois chacune", () => {
    expect(customMetricIdsIn([gridOf([reps, custom]), gridOf([custom])])).toEqual(["metric_1"]);
  });
});

describe("sameGridMetrics", () => {
  const kilos = {
    id: "col_load",
    label: null,
    source: MetricSource.CATALOG,
    key: MetricKey.LOAD,
    unit: MetricUnit.KILOGRAMS,
  } as const;
  const own = {
    id: "col_own",
    label: null,
    source: MetricSource.CUSTOM,
    customMetricId: "metric_1",
  } as const;

  it("reconnaît les mêmes colonnes dans le même ordre, repli de l'ancienne grille ignoré", () => {
    expect(sameGridMetrics([kilos, own], [{ ...kilos }, { ...own }])).toBe(true);
    // Une colonne de l'ancienne grille, telle que le verrou de séance la passe.
    const folded = { ...kilos, collapsed: true };
    expect(sameGridMetrics([kilos], [folded])).toBe(true);
  });

  it("distingue l'ordre, le nombre, le libellé, l'unité et la source", () => {
    expect(sameGridMetrics([reps, load], [load, reps])).toBe(false);
    expect(sameGridMetrics([reps, load], [reps])).toBe(false);
    expect(sameGridMetrics([kilos], [{ ...kilos, label: "Lest" }])).toBe(false);
    expect(sameGridMetrics([kilos], [{ ...kilos, unit: MetricUnit.KILOGRAMS_ADDED }])).toBe(false);
    expect(sameGridMetrics([kilos], [{ ...kilos, key: MetricKey.PERCENT_RM }])).toBe(false);
    expect(sameGridMetrics([kilos], [{ ...own, id: kilos.id }])).toBe(false);
    expect(sameGridMetrics([own], [{ ...kilos, id: own.id }])).toBe(false);
    expect(sameGridMetrics([own], [{ ...own, customMetricId: "metric_2" }])).toBe(false);
  });
});
