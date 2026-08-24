import { describe, expect, it } from "vitest";
import {
  BlockType,
  canCollapseMetric,
  columnValues,
  type ExerciseBlock,
  emomTopCount,
  exerciseBlockSchema,
  MetricSource,
  metricValueTypeOf,
  validateBlockValues,
} from "./exercise-block.schema";
import {
  type CustomMetric,
  MetricKey,
  MetricUnit,
  MetricValueType,
} from "./exercise-metric.schema";

const reps = {
  id: "col_reps",
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
  label: null,
  collapsed: false,
} as const;

const load = {
  id: "col_load",
  source: MetricSource.CATALOG,
  key: MetricKey.LOAD,
  unit: MetricUnit.KILOGRAMS_ADDED,
  label: null,
  collapsed: false,
} as const;

const seriesBlock = (
  rows: ExerciseBlock["rows"],
  metrics: ExerciseBlock["metrics"] = [reps, load],
): ExerciseBlock =>
  exerciseBlockSchema.parse({
    id: "blk_1",
    label: "Travail",
    structure: {
      type: BlockType.SERIES,
      setCount: 4,
      restBetweenSetsSeconds: 150,
    },
    metrics,
    rows,
  });

describe("exerciseBlockSchema", () => {
  it("accepte un bloc Séries complet", () => {
    const block = seriesBlock([
      { id: "r1", values: { col_reps: 6, col_load: 12 } },
      { id: "r2", values: { col_reps: 5, col_load: 12 } },
    ]);
    expect(block.rows).toHaveLength(2);
  });

  it("accepte un bloc SANS ligne — le coach a ses colonnes, pas encore ses valeurs", () => {
    expect(seriesBlock([]).rows).toEqual([]);
  });

  it("refuse deux colonnes de même identifiant", () => {
    const result = exerciseBlockSchema.safeParse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.FREE },
      metrics: [reps, { ...load, id: reps.id }],
      rows: [],
    });
    expect(result.success).toBe(false);
  });

  it("refuse deux lignes de même identifiant", () => {
    const result = exerciseBlockSchema.safeParse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.FREE },
      metrics: [reps],
      rows: [
        { id: "r1", values: {} },
        { id: "r1", values: {} },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("refuse une unité que la métrique n'admet pas", () => {
    const result = exerciseBlockSchema.safeParse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.FREE },
      metrics: [{ ...load, unit: MetricUnit.BPM }],
      rows: [],
    });
    expect(result.success).toBe(false);
  });

  it("refuse un champ inconnu (schéma strict)", () => {
    const result = exerciseBlockSchema.safeParse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.FREE },
      metrics: [reps],
      rows: [],
      shortcut: "PYRAMIDE",
    });
    expect(result.success).toBe(false);
  });
});

describe("les bandeaux", () => {
  it("refuse un EMOM dont la durée totale ne couvre pas un intervalle", () => {
    const result = exerciseBlockSchema.safeParse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 30 },
      metrics: [reps],
      rows: [],
    });
    expect(result.success).toBe(false);
  });

  it("dérive le nombre de tops d'un EMOM plutôt que de le stocker", () => {
    expect(
      emomTopCount({ type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 600 }),
    ).toBe(10);
    expect(
      emomTopCount({ type: BlockType.EMOM, intervalSeconds: 90, totalDurationSeconds: 600 }),
    ).toBe(6);
  });

  it("accepte un AMRAP sans objectif — il est indicatif", () => {
    const result = exerciseBlockSchema.safeParse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.AMRAP, totalDurationSeconds: 480, targetRounds: null },
      metrics: [reps],
      rows: [],
    });
    expect(result.success).toBe(true);
  });

  it("refuse un paramètre de bandeau étranger au type", () => {
    const result = exerciseBlockSchema.safeParse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.FREE, setCount: 4 },
      metrics: [reps],
      rows: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("canCollapseMetric", () => {
  it("autorise le repli quand toutes les valeurs sont identiques", () => {
    const block = seriesBlock([
      { id: "r1", values: { col_reps: 6, col_load: 12 } },
      { id: "r2", values: { col_reps: 5, col_load: 12 } },
    ]);
    expect(canCollapseMetric(block, "col_load")).toBe(true);
    expect(canCollapseMetric(block, "col_reps")).toBe(false);
  });

  it("autorise le repli sur une grille sans ligne — rien à contredire", () => {
    expect(canCollapseMetric(seriesBlock([]), "col_load")).toBe(true);
  });

  it("traite une valeur absente comme null, pas comme un trou distinct", () => {
    const block = seriesBlock([
      { id: "r1", values: { col_reps: 6 } },
      { id: "r2", values: { col_reps: 6, col_load: null } },
    ]);
    expect(columnValues(block, "col_load")).toEqual([null, null]);
    expect(canCollapseMetric(block, "col_load")).toBe(true);
  });
});

describe("validateBlockValues", () => {
  it("ne signale rien sur un bloc cohérent", () => {
    const block = seriesBlock([{ id: "r1", values: { col_reps: 6, col_load: 12 } }]);
    expect(validateBlockValues(block)).toEqual([]);
  });

  it("signale du texte dans une colonne numérique", () => {
    const block = seriesBlock([{ id: "r1", values: { col_reps: "beaucoup", col_load: 12 } }]);
    const issues = validateBlockValues(block);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rowId: "r1", metricId: "col_reps" });
  });

  it("accepte une cellule vide — la dernière série n'a pas de repos", () => {
    const block = seriesBlock([{ id: "r1", values: { col_reps: 6, col_load: null } }]);
    expect(validateBlockValues(block)).toEqual([]);
  });

  it("signale une colonne repliée aux valeurs divergentes", () => {
    const block = seriesBlock(
      [
        { id: "r1", values: { col_reps: 6, col_load: 12 } },
        { id: "r2", values: { col_reps: 6, col_load: 14 } },
      ],
      [reps, { ...load, collapsed: true }],
    );
    const issues = validateBlockValues(block);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.metricId).toBe("col_load");
  });

  it("signale une valeur portée pour une colonne inexistante", () => {
    const block = seriesBlock([{ id: "r1", values: { col_reps: 6, col_fantome: 3 } }]);
    const issues = validateBlockValues(block);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.metricId).toBe("col_fantome");
  });

  it("résout le type d'une colonne personnalisée depuis les métriques du coach", () => {
    const custom: CustomMetric = {
      id: "cm_1",
      label: "Cotation maison",
      unit: null,
      valueType: MetricValueType.SCALE,
      scale: ["1", "2", "3"],
    };
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.FREE },
      metrics: [
        {
          id: "col_c",
          source: MetricSource.CUSTOM,
          customMetricId: "cm_1",
          label: null,
          collapsed: false,
        },
      ],
      rows: [
        { id: "r1", values: { col_c: "2" } },
        { id: "r2", values: { col_c: "9" } },
      ],
    });
    const column = block.metrics.at(0);
    if (!column) throw new Error("La colonne personnalisée devrait exister.");
    expect(metricValueTypeOf(column, [custom])).toBe(MetricValueType.SCALE);
    const issues = validateBlockValues(block, [custom]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.rowId).toBe("r2");
  });

  it("valide une colonne personnalisée qui n'est pas une échelle", () => {
    const custom: CustomMetric = {
      id: "cm_2",
      label: "Indice technique",
      unit: "pts",
      valueType: MetricValueType.NUMBER,
      scale: null,
    };
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.FREE },
      metrics: [
        {
          id: "col_n",
          source: MetricSource.CUSTOM,
          customMetricId: "cm_2",
          label: null,
          collapsed: false,
        },
      ],
      rows: [
        { id: "r1", values: { col_n: 7 } },
        { id: "r2", values: { col_n: "beaucoup" } },
      ],
    });
    const issues = validateBlockValues(block, [custom]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.rowId).toBe("r2");
  });

  it("signale une colonne dont la métrique personnalisée a disparu", () => {
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.FREE },
      metrics: [
        {
          id: "col_c",
          source: MetricSource.CUSTOM,
          customMetricId: "cm_absent",
          label: null,
          collapsed: false,
        },
      ],
      rows: [],
    });
    expect(validateBlockValues(block, [])).toHaveLength(1);
  });
});
