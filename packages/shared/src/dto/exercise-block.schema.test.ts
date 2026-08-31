import { describe, expect, it } from "vitest";
import {
  BlockType,
  blockSegments,
  ColumnFillMode,
  canCollapseMetric,
  columnValues,
  DEFAULT_BLOCK_METRIC_KEYS,
  DEFAULT_BLOCK_STRUCTURE,
  DosageLayout,
  dosageLayout,
  EXERCISE_MAX_BLOCKS,
  type ExerciseBlock,
  emomTopCount,
  emptyRowIndexes,
  exerciseBlockSchema,
  exerciseBlocksSchema,
  fillColumn,
  fittingColumnCount,
  MetricSource,
  metricValueTypeOf,
  restPhrase,
  segmentsDuration,
  structurePhrase,
  timerFor,
  trackingSummary,
  trackingUnits,
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

describe("dosageLayout", () => {
  const withColumns = (count: number, rows: number): ExerciseBlock =>
    seriesBlock(
      Array.from({ length: rows }, (_, index) => ({ id: `r${index}`, values: {} })),
      Array.from({ length: count }, (_, index) => ({ ...reps, id: `col_${index}` })),
    );

  it("compte trois colonnes tenables sur un écran de 402 px", () => {
    // (362 - 28) / 90 = 3,7 → trois colonnes alignées, la quatrième déborde.
    expect(fittingColumnCount()).toBe(3);
  });

  it("dit UNE LIGNE en phrase, quel que soit le nombre de colonnes", () => {
    expect(dosageLayout(withColumns(6, 1))).toBe(DosageLayout.PHRASE);
    expect(dosageLayout(withColumns(6, 0))).toBe(DosageLayout.PHRASE);
  });

  it("aligne jusqu'à trois colonnes, passe en cartes à quatre", () => {
    expect(dosageLayout(withColumns(3, 4))).toBe(DosageLayout.TABLE);
    expect(dosageLayout(withColumns(4, 4))).toBe(DosageLayout.CARDS);
  });

  it("ne compte pas les colonnes REPLIÉES", () => {
    // Elles ont rejoint la phrase de dosage : les compter ferait basculer en cartes un tableau
    // qui tient largement.
    const block = withColumns(5, 3);
    const folded: ExerciseBlock = {
      ...block,
      metrics: block.metrics.map((metric, index) =>
        index < 2 ? metric : { ...metric, collapsed: true },
      ),
    };
    expect(dosageLayout(folded)).toBe(DosageLayout.TABLE);
  });

  it("suit une largeur d'écran plus généreuse", () => {
    // Le seuil est un CALCUL, pas une constante : un grand téléphone aligne une colonne de plus.
    expect(dosageLayout(withColumns(4, 3), 500)).toBe(DosageLayout.TABLE);
  });
});

describe("trackingUnits", () => {
  const series = (setCount: number, rows: number): ExerciseBlock => ({
    ...seriesBlock(Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, values: {} }))),
    structure: { type: BlockType.SERIES, setCount, restBetweenSetsSeconds: null },
  });

  it("compte les séries depuis le BANDEAU, pas depuis la grille", () => {
    // « ×4 séries » est le nombre de fois qu'on fait l'effort, que la grille détaille chaque
    // série ou n'en donne qu'une commune.
    expect(trackingUnits(series(4, 1))).toEqual({ mode: "CHECK", unit: "SET", count: 4 });
    expect(trackingUnits(series(4, 4))).toEqual({ mode: "CHECK", unit: "SET", count: 4 });
    expect(trackingUnits(series(4, 2))).toEqual({ mode: "CHECK", unit: "SET", count: 4 });
  });

  it("nomme l'unité par type", () => {
    const withStructure = (structure: ExerciseBlock["structure"], rows = 1): ExerciseBlock => ({
      ...seriesBlock(Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, values: {} }))),
      structure,
    });
    expect(
      trackingUnits(
        withStructure({ type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 600 }),
      ),
    ).toEqual({ mode: "CHECK", unit: "TOP", count: 10 });
    expect(
      trackingUnits(
        withStructure({ type: BlockType.CIRCUIT, roundCount: 3, restBetweenRoundsSeconds: null }),
      ),
    ).toEqual({ mode: "CHECK", unit: "ROUND", count: 3 });
    // LIBRE n'a pas de bandeau : ses LIGNES sont ses étapes.
    expect(trackingUnits(withStructure({ type: BlockType.FREE }, 3))).toEqual({
      mode: "CHECK",
      unit: "STEP",
      count: 3,
    });
  });

  it("COMPTE l'AMRAP au lieu de le cocher", () => {
    const amrap: ExerciseBlock = {
      ...seriesBlock([{ id: "r1", values: {} }]),
      structure: { type: BlockType.AMRAP, totalDurationSeconds: 480, targetRounds: 12 },
    };
    // L'objectif est indicatif : cocher « 12 tours » ferait d'une orientation une exigence.
    expect(trackingUnits(amrap)).toEqual({ mode: "COUNT", unit: "ROUND" });
  });

  it("ne suit rien quand il n'y a rien à cocher", () => {
    const empty: ExerciseBlock = { ...seriesBlock([]), structure: { type: BlockType.FREE } };
    expect(trackingUnits(empty)).toBeNull();
  });
});

describe("trackingSummary", () => {
  const block = (id: string, setCount: number): ExerciseBlock => ({
    ...seriesBlock([{ id: "r1", values: {} }]),
    id,
    structure: { type: BlockType.SERIES, setCount, restBetweenSetsSeconds: null },
  });

  it("distingue NON SUIVI de zéro coché", () => {
    // Ne rien cocher n'est pas ne rien faire : le troisième état est SILENCIEUX.
    const blocks = [block("b1", 4)];
    expect(trackingSummary(blocks, null)).toMatchObject({ state: "UNTRACKED", done: 0, total: 4 });
    expect(trackingSummary(blocks, {})).toMatchObject({ state: "PARTIAL", done: 0, total: 4 });
  });

  it("additionne les blocs et rend tout terminé", () => {
    const blocks = [block("b1", 2), block("b2", 3)];
    const tracking = { b1: { checked: [0, 1] }, b2: { checked: [0, 1, 2] } };
    expect(trackingSummary(blocks, tracking)).toMatchObject({ state: "DONE", done: 5, total: 5 });
  });

  it("borne le décompte au nombre d'unités", () => {
    // Un bandeau réduit après coup ne doit pas produire « 5 sur 2 ».
    const blocks = [block("b1", 2)];
    expect(trackingSummary(blocks, { b1: { checked: [0, 1, 2, 3, 4] } })).toMatchObject({
      done: 2,
      total: 2,
    });
  });

  it("ignore le compte d'un AMRAP dans le total cochable", () => {
    const amrap: ExerciseBlock = {
      ...block("b1", 1),
      structure: { type: BlockType.AMRAP, totalDurationSeconds: 480, targetRounds: null },
    };
    expect(trackingSummary([amrap], { b1: { rounds: 7 } })).toMatchObject({ done: 0, total: 0 });
  });
});

describe("timerFor", () => {
  const effortColumn = {
    id: "col_effort",
    source: MetricSource.CATALOG,
    key: MetricKey.EFFORT_DURATION,
    unit: MetricUnit.NONE,
    label: null,
    collapsed: false,
  };

  // `metrics` typé explicitement : sans ça il s'infère du littéral `reps` figé par `as const`, et
  // n'accepte plus une autre colonne. Même piège que sur les fixtures de dosage.
  const withStructure = (
    structure: ExerciseBlock["structure"],
    metrics: ExerciseBlock["metrics"] = [reps],
    rows: ExerciseBlock["rows"] = [{ id: "r1", values: {} }],
  ): ExerciseBlock => ({ ...seriesBlock(rows, metrics), structure });

  it("joue le repos d'une Séries", () => {
    expect(
      timerFor(withStructure({ type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: 150 })),
    ).toEqual({ kind: "REST", restSeconds: 150 });
  });

  it("n'invente PAS de repos quand le coach n'en a pas posé", () => {
    // Une durée inventée ferait passer une supposition pour une consigne.
    expect(
      timerFor(
        withStructure({ type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null }),
      ),
    ).toBeNull();
  });

  it("préfère l'alternance effort/repos quand la grille porte une durée d'effort", () => {
    // « 10 × 30 s d'effort » se joue en alternance, pas comme dix repos successifs.
    const block = withStructure(
      { type: BlockType.SERIES, setCount: 10, restBetweenSetsSeconds: 30 },
      [effortColumn],
      [{ id: "r1", values: { col_effort: 30 } }],
    );
    expect(timerFor(block)).toEqual({ kind: "EFFORT_REST", effortSeconds: 30, restSeconds: 30 });
  });

  it("dérive les tops d'un EMOM des deux durées, sans les stocker", () => {
    expect(
      timerFor(
        withStructure({ type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 600 }),
      ),
    ).toEqual({ kind: "INTERVAL", intervalSeconds: 60, topCount: 10 });
  });

  it("compte à rebours sur un AMRAP", () => {
    expect(
      timerFor(
        withStructure({ type: BlockType.AMRAP, totalDurationSeconds: 480, targetRounds: null }),
      ),
    ).toEqual({ kind: "COUNTDOWN", totalSeconds: 480 });
  });

  it("n'impose aucun timer à un bloc LIBRE", () => {
    expect(timerFor(withStructure({ type: BlockType.FREE }))).toBeNull();
  });

  it("joue le repos entre tours d'un Circuit", () => {
    expect(
      timerFor(
        withStructure({ type: BlockType.CIRCUIT, roundCount: 4, restBetweenRoundsSeconds: 180 }),
      ),
    ).toEqual({ kind: "REST", restSeconds: 180 });
  });
});

describe("blockSegments", () => {
  const effort = {
    id: "col_effort",
    source: MetricSource.CATALOG,
    key: MetricKey.EFFORT_DURATION,
    unit: MetricUnit.NONE,
    label: null,
    collapsed: false,
  } as const;

  const rest = {
    id: "col_rest",
    source: MetricSource.CATALOG,
    key: MetricKey.REST_BETWEEN_SETS,
    unit: MetricUnit.NONE,
    label: null,
    collapsed: false,
  } as const;

  const kinds = (block: ExerciseBlock) =>
    blockSegments(block).map((segment) => `${segment.kind} ${segment.seconds}`);

  it("alterne effort et repos, et ne pose PAS de repos après la dernière série", () => {
    // 3 × (30 s d'effort) avec 45 s de récupération : le dernier repos n'existe pas, l'exercice
    // est fini et le suivant a le sien.
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: 45 },
      metrics: [effort],
      rows: [{ id: "r1", values: { col_effort: 30 } }],
    });

    expect(kinds(block)).toEqual(["EFFORT 30", "REST 45", "EFFORT 30", "REST 45", "EFFORT 30"]);
  });

  it("le repos d'une LIGNE l'emporte sur le repos d'ensemble", () => {
    // Le cas réel : « 8 min entre séries, sauf 1 min après les deux premières ».
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: 480 },
      metrics: [effort, rest],
      rows: [
        { id: "r1", values: { col_effort: 30, col_rest: 60 } },
        { id: "r2", values: { col_effort: 30, col_rest: 60 } },
        { id: "r3", values: { col_effort: 30 } },
      ],
    });

    expect(kinds(block)).toEqual(["EFFORT 30", "REST 60", "EFFORT 30", "REST 60", "EFFORT 30"]);
  });

  it("un CIRCUIT rejoue toute la grille, avec deux repos de portée différente", () => {
    // 2 tours de 3 stations à 30 s : 1 min entre stations, 8 min entre tours. C'est la forme qui
    // porte « 5 séries de 4 × 30 s de traction ».
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.CIRCUIT, roundCount: 2, restBetweenRoundsSeconds: 480 },
      metrics: [effort, rest],
      rows: [
        { id: "r1", values: { col_effort: 30, col_rest: 60 } },
        { id: "r2", values: { col_effort: 30, col_rest: 60 } },
        { id: "r3", values: { col_effort: 30 } },
      ],
    });

    expect(kinds(block)).toEqual([
      "EFFORT 30",
      "REST 60",
      "EFFORT 30",
      "REST 60",
      "EFFORT 30",
      "REST 480",
      "EFFORT 30",
      "REST 60",
      "EFFORT 30",
      "REST 60",
      "EFFORT 30",
    ]);
  });

  it("une série SANS durée d'effort attend un GESTE avant de lancer le repos", () => {
    // « 8 tractions » se fait au rythme de l'athlète. Sans le segment manuel, les trois repos
    // s'enchaîneraient d'affilée : le minuteur tournerait pendant qu'il grimpe encore.
    const block = seriesBlock([{ id: "r1", values: { col_reps: 8 } }]);
    expect(kinds(block)).toEqual([
      "MANUAL 0",
      "REST 150",
      "MANUAL 0",
      "REST 150",
      "MANUAL 0",
      "REST 150",
      "MANUAL 0",
    ]);
  });

  it("un bloc sans aucune durée n'a QUE des gestes — rien à chronométrer", () => {
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: null },
      metrics: [reps],
      rows: [{ id: "r1", values: { col_reps: 8 } }],
    });

    expect(kinds(block)).toEqual(["MANUAL 0", "MANUAL 0", "MANUAL 0"]);
    // Aucune seconde à annoncer : la durée appartient à l'athlète.
    expect(segmentsDuration(blockSegments(block))).toBe(0);
  });

  it("un EMOM déroule un intervalle par top ; un AMRAP une seule échéance", () => {
    const emom = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 180 },
      metrics: [reps],
      rows: [{ id: "r1", values: { col_reps: 3 } }],
    });
    expect(kinds(emom)).toEqual(["INTERVAL 60", "INTERVAL 60", "INTERVAL 60"]);
    expect(blockSegments(emom).map((s) => s.unitIndex)).toEqual([0, 1, 2]);

    const amrap = exerciseBlockSchema.parse({
      id: "blk_2",
      label: null,
      structure: { type: BlockType.AMRAP, totalDurationSeconds: 480, targetRounds: null },
      metrics: [reps],
      rows: [{ id: "r1", values: { col_reps: 5 } }],
    });
    expect(kinds(amrap)).toEqual(["COUNTDOWN 480"]);
  });

  it("le repos appartient à l'unité qui VIENT de finir, pas à la suivante", () => {
    // Ce que ça pilote : cocher la série 1 au moment où son repos commence, et non à la fin du
    // repos — l'athlète a fini sa série, le décompte doit le dire tout de suite.
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.SERIES, setCount: 2, restBetweenSetsSeconds: 60 },
      metrics: [effort],
      rows: [{ id: "r1", values: { col_effort: 30 } }],
    });

    expect(blockSegments(block).map((s) => [s.kind, s.unitIndex])).toEqual([
      ["EFFORT", 0],
      ["REST", 0],
      ["EFFORT", 1],
    ]);
  });

  it("la durée totale additionne tout le déroulé", () => {
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: 45 },
      metrics: [effort],
      rows: [{ id: "r1", values: { col_effort: 30 } }],
    });
    expect(segmentsDuration(blockSegments(block))).toBe(30 * 3 + 45 * 2);
  });
});
