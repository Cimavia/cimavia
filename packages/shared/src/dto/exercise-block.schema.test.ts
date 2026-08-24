import { describe, expect, it } from "vitest";
import {
  BlockShortcut,
  BlockType,
  ColumnFillMode,
  canCollapseMetric,
  columnValues,
  DEFAULT_BLOCK_METRIC_KEYS,
  DEFAULT_BLOCK_STRUCTURE,
  EXERCISE_MAX_BLOCKS,
  type ExerciseBlock,
  emomTopCount,
  emptyRowIndexes,
  exerciseBlockSchema,
  exerciseBlocksSchema,
  fillColumn,
  MetricSource,
  metricValueTypeOf,
  restPhrase,
  SHORTCUT_PRESETS,
  structurePhrase,
  validateBlockValues,
} from "./exercise-block.schema";
import {
  type CustomMetric,
  defaultUnitOf,
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

describe("exerciseBlocksSchema", () => {
  const block = (id: string) => ({
    id,
    label: null,
    structure: { type: BlockType.FREE },
    metrics: [reps],
    rows: [],
  });

  it("accepte un exercice sans aucun bloc — cas légitime, enregistrable", () => {
    expect(exerciseBlocksSchema.parse([])).toEqual([]);
  });

  it("refuse deux blocs de même identifiant", () => {
    expect(exerciseBlocksSchema.safeParse([block("b1"), block("b1")]).success).toBe(false);
  });

  it("refuse au-delà du plafond de blocs", () => {
    const blocks = Array.from({ length: EXERCISE_MAX_BLOCKS + 1 }, (_, i) => block(`b${i}`));
    expect(exerciseBlocksSchema.safeParse(blocks).success).toBe(false);
  });
});

describe("valeurs de départ", () => {
  const column = (key: (typeof DEFAULT_BLOCK_METRIC_KEYS)[BlockType][number]) => ({
    id: "col_1",
    source: MetricSource.CATALOG,
    key,
    unit: defaultUnitOf(key),
    label: null,
    collapsed: false,
  });

  it.each(Object.values(BlockType))("produit un bloc %s valide sans rien saisir", (type) => {
    const block = {
      id: "blk_1",
      label: null,
      structure: DEFAULT_BLOCK_STRUCTURE[type],
      metrics: DEFAULT_BLOCK_METRIC_KEYS[type].map(column),
      rows: [],
    };
    expect(exerciseBlockSchema.safeParse(block).success).toBe(true);
  });

  it.each(Object.values(BlockShortcut))("le raccourci %s produit des SÉRIES", (shortcut) => {
    // Un raccourci n'est pas un type : le bloc obtenu doit être indistinguable d'une Séries
    // saisie à la main, sinon tout l'aval aurait un cas de plus à traiter.
    expect(SHORTCUT_PRESETS[shortcut].structure.type).toBe(BlockType.SERIES);
  });

  it("ne devine pas le repos — il reste nul", () => {
    // Le nombre de séries a une valeur plausible, pas le repos : l'inventer ferait passer une
    // supposition pour une consigne.
    expect(DEFAULT_BLOCK_STRUCTURE.SERIES.restBetweenSetsSeconds).toBeNull();
    expect(DEFAULT_BLOCK_STRUCTURE.CIRCUIT.restBetweenRoundsSeconds).toBeNull();
    expect(DEFAULT_BLOCK_STRUCTURE.AMRAP.targetRounds).toBeNull();
  });
});

describe("fillColumn", () => {
  const rows = (...reps: (number | string | null)[]) =>
    reps.map((value, index) => ({ id: `r${index}`, values: { col_reps: value } }));

  const read = (block: ExerciseBlock) => columnValues(block, "col_reps");

  it("pose la même valeur partout", () => {
    const block = seriesBlock(rows(6, 5, 4), [reps]);
    const filled = fillColumn(block, "col_reps", { mode: ColumnFillMode.SAME, value: 8 });
    expect(read({ ...block, rows: filled })).toEqual([8, 8, 8]);
  });

  it("construit une progression régulière", () => {
    const block = seriesBlock(rows(null, null, null, null), [reps]);
    const filled = fillColumn(block, "col_reps", { mode: ColumnFillMode.STEP, start: 8, step: 2 });
    expect(read({ ...block, rows: filled })).toEqual([8, 10, 12, 14]);
  });

  it("accepte un pas négatif — une série dégressive est un cas courant", () => {
    const block = seriesBlock(rows(null, null, null), [reps]);
    const filled = fillColumn(block, "col_reps", {
      mode: ColumnFillMode.STEP,
      start: 12,
      step: -2,
    });
    expect(read({ ...block, rows: filled })).toEqual([12, 10, 8]);
  });

  it("progresse sur l'échelle et BUTE sur le dernier palier", () => {
    // Reboucler à « 5a » après le sommet produirait une consigne absurde que rien ne signalerait.
    const block = seriesBlock(rows(null, null, null, null), [reps]);
    const filled = fillColumn(block, "col_reps", {
      mode: ColumnFillMode.SCALE_STEP,
      scale: ["5a", "5b", "6a"],
      start: "5a",
      step: 1,
    });
    expect(read({ ...block, rows: filled })).toEqual(["5a", "5b", "6a", "6a"]);
  });

  it("vide la colonne si le palier de départ n'est pas dans l'échelle", () => {
    const block = seriesBlock(rows(null, null), [reps]);
    const filled = fillColumn(block, "col_reps", {
      mode: ColumnFillMode.SCALE_STEP,
      scale: ["5a", "5b"],
      start: "V4",
      step: 1,
    });
    expect(read({ ...block, rows: filled })).toEqual([null, null]);
  });

  it("reflète la première moitié, sans dupliquer le sommet d'une pyramide impaire", () => {
    const block = seriesBlock(rows(4, 6, 8, null, null), [reps]);
    const filled = fillColumn(block, "col_reps", { mode: ColumnFillMode.MIRROR });
    expect(read({ ...block, rows: filled })).toEqual([4, 6, 8, 6, 4]);
  });

  it("ne touche PAS aux autres colonnes", () => {
    const block = seriesBlock(
      [
        { id: "r1", values: { col_reps: 6, col_load: 12 } },
        { id: "r2", values: { col_reps: 5, col_load: 14 } },
      ],
      [reps, load],
    );
    const filled = fillColumn(block, "col_reps", { mode: ColumnFillMode.SAME, value: 9 });
    expect(columnValues({ ...block, rows: filled }, "col_load")).toEqual([12, 14]);
  });
});

describe("structurePhrase / restPhrase", () => {
  it("annonce le nombre de séries et son repos séparément", () => {
    const structure = {
      type: BlockType.SERIES,
      setCount: 4,
      restBetweenSetsSeconds: 150,
    } as const;
    expect(structurePhrase(structure)).toEqual({
      key: "exercise.dosage.series",
      params: { count: 4 },
    });
    // Le repos se lit APRÈS le reste : deux phrases, pas une clé à trous.
    expect(restPhrase(structure)).toEqual({
      key: "exercise.dosage.restBetweenSets",
      params: { rest: "2'30" },
    });
  });

  it("n'invente pas de repos quand le coach n'en a pas posé", () => {
    const structure = {
      type: BlockType.SERIES,
      setCount: 4,
      restBetweenSetsSeconds: null,
    } as const;
    expect(restPhrase(structure)).toBeNull();
  });

  it("met les durées en forme lisible", () => {
    expect(
      structurePhrase({ type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 600 }),
    ).toEqual({ key: "exercise.dosage.emom", params: { interval: "1'", total: "10'" } });
  });

  it("change de phrase selon que l'AMRAP porte un objectif ou non", () => {
    const base = { type: BlockType.AMRAP, totalDurationSeconds: 480 } as const;
    expect(structurePhrase({ ...base, targetRounds: null })?.key).toBe("exercise.dosage.amrap");
    expect(structurePhrase({ ...base, targetRounds: 12 })).toEqual({
      key: "exercise.dosage.amrapWithTarget",
      params: { total: "8'", count: 12 },
    });
  });

  it("ne dit RIEN d'un bloc libre — il n'a aucun paramètre d'ensemble", () => {
    expect(structurePhrase({ type: BlockType.FREE })).toBeNull();
    expect(restPhrase({ type: BlockType.FREE })).toBeNull();
  });
});

describe("emptyRowIndexes", () => {
  it("repère les lignes sans aucune valeur", () => {
    const block = seriesBlock([
      { id: "r1", values: { col_reps: 6 } },
      { id: "r2", values: {} },
      { id: "r3", values: { col_reps: null, col_load: null } },
    ]);
    expect(emptyRowIndexes(block)).toEqual([1, 2]);
  });

  it("ne signale pas une ligne partiellement remplie — une cellule vide est légitime", () => {
    // La dernière série n'a pas de repos, un étirement n'a pas de charge : l'incomplet normal
    // n'est pas un défaut.
    const block = seriesBlock([{ id: "r1", values: { col_reps: 6, col_load: null } }]);
    expect(emptyRowIndexes(block)).toEqual([]);
  });

  it("ignore les valeurs de colonnes disparues", () => {
    // Une valeur orpheline ne rend pas la ligne « remplie » : elle ne s'affiche nulle part.
    const block = seriesBlock([{ id: "r1", values: { col_fantome: 3 } }]);
    expect(emptyRowIndexes(block)).toEqual([0]);
  });
});
