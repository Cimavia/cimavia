import { describe, expect, it } from "vitest";
// Depuis l'index et non le fichier : #355 découpera ce module en utils, et ces tests doivent
// survivre au déménagement sans retouche.
import {
  BLOCK_MAX_ROWS,
  BlockType,
  blockSegments,
  ColumnFillMode,
  type CustomMetric,
  canCollapseMetric,
  columnValues,
  customMetricIdsIn,
  DEFAULT_BLOCK_METRIC_KEYS,
  DEFAULT_BLOCK_STRUCTURE,
  DosageLayout,
  defaultUnitOf,
  dosageLayout,
  EXERCISE_MAX_BLOCKS,
  type ExerciseBlock,
  emomTopCount,
  emptyRowIndexes,
  exerciseBlockSchema,
  exerciseBlocksSchema,
  fillableRows,
  fillColumn,
  fittingColumnCount,
  GridSlotKind,
  gridSlots,
  MetricKey,
  MetricSource,
  MetricUnit,
  MetricValueType,
  metricValueTypeOf,
  readingRowLabel,
  readingRows,
  restPhrase,
  rowForUnit,
  SegmentKind,
  scaleFor,
  segmentsDuration,
  structurePhrase,
  TimerKind,
  TrackingState,
  TrackingUnit,
  timerFor,
  trackableExercises,
  trackingSummary,
  trackingUnits,
  unitValues,
  validateBlockValues,
  withCellValue,
  withDuplicatedLastRow,
  withMaterializedSeries,
} from "../index";

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

  it("progresse d'un pas décimal", () => {
    const block = seriesBlock(rows(null, null, null, null), [reps]);
    const filled = fillColumn(block, "col_reps", {
      mode: ColumnFillMode.STEP,
      start: 10,
      step: 2.5,
    });
    expect(read({ ...block, rows: filled })).toEqual([10, 12.5, 15, 17.5]);
  });

  it("n'affiche pas l'erreur d'arrondi de la virgule flottante", () => {
    // 0 + 3 × 0,1 vaut 0,30000000000000004 en virgule flottante.
    const block = seriesBlock(rows(null, null, null, null, null), [reps]);
    const filled = fillColumn(block, "col_reps", {
      mode: ColumnFillMode.STEP,
      start: 1.1,
      step: 0.1,
    });
    expect(read({ ...block, rows: filled })).toEqual([1.1, 1.2, 1.3, 1.4, 1.5]);
  });

  it("garde les décimales du départ quand le pas est entier", () => {
    const block = seriesBlock(rows(null, null, null), [reps]);
    const filled = fillColumn(block, "col_reps", {
      mode: ColumnFillMode.STEP,
      start: 0.25,
      step: 1,
    });
    expect(read({ ...block, rows: filled })).toEqual([0.25, 1.25, 2.25]);
  });

  it("n'arrondit pas un nombre qu'il ne sait pas compter", () => {
    const block = seriesBlock(rows(null, null), [reps]);
    const filled = fillColumn(block, "col_reps", {
      mode: ColumnFillMode.STEP,
      start: 1e-7,
      step: 1e-7,
    });
    expect(read({ ...block, rows: filled })).toEqual([1e-7, 2e-7]);
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
      structurePhrase({ type: BlockType.EMOM, intervalSeconds: 90, totalDurationSeconds: 600 }),
    ).toEqual({ key: "exercise.dosage.emom", params: { interval: "1'30", total: "10'" } });
  });

  // #528 : « Toutes les 1' pendant 10' » se lisait mal, pour l'EMOM le plus courant.
  it("dit « chaque minute » d'un EMOM à intervalle d'une minute, sans répéter l'intervalle", () => {
    expect(
      structurePhrase({ type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 600 }),
    ).toEqual({ key: "exercise.dosage.emomEveryMinute", params: { total: "10'" } });
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

describe("scaleFor", () => {
  const gradeColumn = {
    id: "col_grade",
    source: MetricSource.CATALOG,
    key: MetricKey.GRADE,
    unit: MetricUnit.NONE,
    label: null,
    collapsed: false,
  } as const;

  it("la cotation du catalogue porte ses paliers, de 4a à 9c", () => {
    const scale = scaleFor(gradeColumn, []);
    expect(scale?.[0]).toBe("4a");
    expect(scale?.at(-1)).toBe("9c");
    // Pas de « + » sous le sixième degré : la cotation française ne les emploie pas.
    expect(scale).toContain("6a+");
    expect(scale).not.toContain("5a+");
  });

  it("une valeur hors échelle est REFUSÉE, ce qu'une cotation sans paliers laissait passer", () => {
    const block = exerciseBlockSchema.parse({
      id: "blk_1",
      label: null,
      structure: { type: BlockType.SERIES, setCount: 1, restBetweenSetsSeconds: null },
      metrics: [gradeColumn],
      rows: [{ id: "r1", values: { col_grade: "12z" } }],
    });

    expect(validateBlockValues(block, [])).toHaveLength(1);
  });

  it("une métrique maison garde SON échelle, et une métrique sans échelle rend null", () => {
    const custom: CustomMetric = {
      id: "cm_1",
      label: "Cotation bloc",
      unit: null,
      valueType: MetricValueType.SCALE,
      scale: ["V0", "V1"],
    };
    const customColumn = {
      id: "col_custom",
      source: MetricSource.CUSTOM,
      customMetricId: "cm_1",
      label: null,
      collapsed: false,
    } as const;

    expect(scaleFor(customColumn, [custom])).toEqual(["V0", "V1"]);
    expect(scaleFor(reps, [])).toBeNull();
  });
});

describe("withCellValue", () => {
  const rows = [
    { id: "r1", values: { reps: 6, load: 10 } },
    { id: "r2", values: { reps: 6, load: 10 } },
  ];

  it("réécrit une seule cellule, sans toucher aux autres colonnes ni aux autres lignes", () => {
    expect(withCellValue(rows, "r2", "load", 12.5)).toEqual([
      { id: "r1", values: { reps: 6, load: 10 } },
      { id: "r2", values: { reps: 6, load: 12.5 } },
    ]);
  });

  it("vide une cellule en y posant null, jamais zéro", () => {
    expect(withCellValue(rows, "r1", "load", null)[0]?.values.load).toBeNull();
  });
});

describe("withDuplicatedLastRow", () => {
  it("ajoute une ligne qui recopie la dernière", () => {
    const rows = [{ id: "r1", values: { reps: 6, rest: 150 } }];
    expect(withDuplicatedLastRow(rows, "r2")).toEqual([
      { id: "r1", values: { reps: 6, rest: 150 } },
      { id: "r2", values: { reps: 6, rest: 150 } },
    ]);
  });

  it("ajoute une ligne vide à un bloc qui n'en a pas", () => {
    expect(withDuplicatedLastRow([], "r1")).toEqual([{ id: "r1", values: {} }]);
  });

  it("n'ajoute rien au plafond, et rend les lignes intactes", () => {
    const full = Array.from({ length: BLOCK_MAX_ROWS }, (_, index) => ({
      id: `r${index}`,
      values: {},
    }));
    expect(withDuplicatedLastRow(full, "extra")).toBe(full);
  });
});

// ── Couverture #506 : les comportements qu'aucun test ne fixait ─────────────────────────────

const effortColumn = {
  id: "col_effort",
  source: MetricSource.CATALOG,
  key: MetricKey.EFFORT_DURATION,
  unit: MetricUnit.NONE,
  label: null,
  collapsed: false,
} as const;

const roundRestColumn = {
  id: "col_round_rest",
  source: MetricSource.CATALOG,
  key: MetricKey.REST_BETWEEN_ROUNDS,
  unit: MetricUnit.NONE,
  label: null,
  collapsed: false,
} as const;

const customColumn = (id: string, customMetricId: string) =>
  ({ id, source: MetricSource.CUSTOM, customMetricId, label: null, collapsed: false }) as const;

const freeBlock = (rows: ExerciseBlock["rows"], metrics: ExerciseBlock["metrics"]) =>
  exerciseBlockSchema.parse({
    id: "blk_free",
    label: null,
    structure: { type: BlockType.FREE },
    metrics,
    rows,
  });

describe("customMetricIdsIn", () => {
  /**
   * Ce qui part dans le snapshot de diffusion : sans ces définitions, l'athlète ne lirait qu'un
   * identifiant. Chacune UNE fois, même citée par plusieurs blocs, dans l'ordre d'apparition.
   */
  it("liste les métriques maison citées, sans doublon, dans l'ordre", () => {
    const blocks = [
      seriesBlock([], [reps, customColumn("c1", "cm_b"), customColumn("c2", "cm_a")]),
      { ...seriesBlock([], [customColumn("c3", "cm_b")]), id: "blk_2" },
    ];

    expect(customMetricIdsIn(blocks)).toEqual(["cm_b", "cm_a"]);
  });

  it("ne rend rien quand seul le catalogue est cité", () => {
    expect(customMetricIdsIn([seriesBlock([])])).toEqual([]);
    expect(customMetricIdsIn([])).toEqual([]);
  });
});

describe("rowForUnit", () => {
  const block = seriesBlock([
    { id: "r1", values: { col_reps: 6 } },
    { id: "r2", values: { col_reps: 5 } },
  ]);

  it("rend la ligne de l'unité quand elle existe", () => {
    expect(rowForUnit(block, 1)?.id).toBe("r2");
  });

  // Quatre séries, deux lignes : les deux dernières reprennent la DERNIÈRE ligne, comme « Ajouter
  // une ligne » la duplique et comme la grille du coach les montre en fantôme (#520).
  it("se replie sur la dernière ligne au-delà de la grille", () => {
    expect(rowForUnit(block, 2)?.id).toBe("r2");
    expect(rowForUnit(block, 3)?.id).toBe("r2");
  });

  it("rend null sur un bloc sans ligne", () => {
    expect(rowForUnit(seriesBlock([]), 0)).toBeNull();
  });

  // Le cas du retour coach : 10 × 1 kg puis 10 × 2 kg, quatre séries. L'athlète jouait 1, 2, 1, 1.
  it("fait jouer la dernière ligne aux séries non détaillées du déroulé", () => {
    const loads = blockSegments(
      seriesBlock([
        { id: "r1", values: { col_reps: 10, col_load: 1 } },
        { id: "r2", values: { col_reps: 10, col_load: 2 } },
      ]),
    )
      .filter((segment) => segment.kind === SegmentKind.MANUAL)
      .map((segment) => segment.rowId);

    expect(loads).toEqual(["r1", "r2", "r2", "r2"]);
  });
});

/** `count` lignes vides, nommées r1, r2… */
const emptyRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `r${index + 1}`, values: {} }));

/** Une Séries de `setCount` séries dont la grille porte `count` lignes. */
const withSets = (count: number, setCount: number): ExerciseBlock => {
  const block = seriesBlock(emptyRows(count));
  return { ...block, structure: { ...block.structure, setCount } } as ExerciseBlock;
};

describe("readingRows", () => {
  const read = (block: ExerciseBlock) =>
    readingRows(block).map((reading) => [reading.row.id, readingRowLabel(reading)]);

  it("regroupe les séries qui reprennent la dernière ligne", () => {
    expect(read(withSets(2, 4))).toEqual([
      ["r1", "1"],
      ["r2", "2–4"],
    ]);
  });

  it("lit une grille commune comme une seule ligne pour toutes les séries", () => {
    expect(read(withSets(1, 4))).toEqual([["r1", "1–4"]]);
  });

  it("lit une ligne par série quand la grille les détaille toutes", () => {
    expect(read(withSets(3, 3))).toEqual([
      ["r1", "1"],
      ["r2", "2"],
      ["r3", "3"],
    ]);
  });

  // Personne ne jouera la quatrième : l'annoncer à l'athlète lui ferait chercher une série de trop.
  it("tait les lignes au-delà du nombre de séries", () => {
    expect(read(withSets(4, 2))).toEqual([
      ["r1", "1"],
      ["r2", "2"],
    ]);
  });

  it("ne lit rien d'une grille vide", () => {
    expect(readingRows(withSets(0, 4))).toEqual([]);
  });

  it("garde chaque ligne d'un bloc qui n'est pas une Séries", () => {
    expect(read(freeBlock(emptyRows(2), [reps]))).toEqual([
      ["r1", "1"],
      ["r2", "2"],
    ]);
  });

  it("dit en phrase une Séries d'une série dont la grille garde une ligne de trop", () => {
    expect(dosageLayout(withSets(2, 1))).toBe(DosageLayout.PHRASE);
  });
});

describe("gridSlots", () => {
  /** Chaque rang en abrégé : la nature, puis la ligne montrée ou reprise. */
  const shape = (block: ExerciseBlock) =>
    gridSlots(block).map((slot) =>
      slot.kind === GridSlotKind.GHOST_SET
        ? `${slot.index}:ghost<${slot.source?.row.id ?? "—"}`
        : `${slot.index}:${slot.kind}=${slot.row.id}`,
    );

  // Aucune valeur inventée (règle n°5) : un fantôme sans ligne à reprendre ne reprend rien.
  it("montre N séries fantômes sans source sur une grille vide", () => {
    expect(shape(withSets(0, 2))).toEqual(["0:ghost<—", "1:ghost<—"]);
  });

  it("montre une grille commune comme la série 1, reprise par les autres", () => {
    expect(shape(withSets(1, 3))).toEqual(["0:SET=r1", "1:ghost<r1", "2:ghost<r1"]);
  });

  it("fait reprendre la DERNIÈRE ligne aux séries non détaillées", () => {
    const slots = gridSlots(withSets(2, 4));
    expect(shape(withSets(2, 4))).toEqual(["0:SET=r1", "1:SET=r2", "2:ghost<r2", "3:ghost<r2"]);
    expect(slots[2]).toMatchObject({ source: { index: 1 } });
  });

  it("montre une ligne par série quand elles se couvrent exactement", () => {
    expect(shape(withSets(2, 2))).toEqual(["0:SET=r1", "1:SET=r2"]);
  });

  it("marque non jouées les lignes au-delà du nombre de séries", () => {
    expect(shape(withSets(3, 1))).toEqual(["0:SET=r1", "1:UNPLAYED=r2", "2:UNPLAYED=r3"]);
  });

  it("garde de simples lignes sur un bloc qui n'est pas une Séries", () => {
    expect(shape(freeBlock(emptyRows(2), [reps]))).toEqual(["0:LINE=r1", "1:LINE=r2"]);
  });
});

describe("withMaterializedSeries", () => {
  const ids = (index: number) => `new${index}`;

  it("crée les lignes jusqu'à la série visée, en recopiant la dernière", () => {
    const rows = [
      { id: "r1", values: { col_load: 1 } },
      { id: "r2", values: { col_load: 2 } },
    ];
    expect(withMaterializedSeries(rows, 3, ids)).toEqual([
      ...rows,
      { id: "new2", values: { col_load: 2 } },
      { id: "new3", values: { col_load: 2 } },
    ]);
  });

  it("crée des lignes vides sur une grille qui n'en a pas", () => {
    expect(withMaterializedSeries([], 1, ids)).toEqual([
      { id: "new0", values: {} },
      { id: "new1", values: {} },
    ]);
  });

  it("rend les lignes intactes quand la série a déjà la sienne", () => {
    const rows = [{ id: "r1", values: {} }];
    expect(withMaterializedSeries(rows, 0, ids)).toBe(rows);
  });

  it("s'arrête au plafond de lignes", () => {
    expect(withMaterializedSeries([], BLOCK_MAX_ROWS + 5, ids)).toHaveLength(BLOCK_MAX_ROWS);
  });
});

describe("fillableRows", () => {
  const ids = (index: number) => `new${index}`;

  it("détaille les N séries d'une Séries avant un remplissage", () => {
    const rows = fillableRows(seriesBlock([{ id: "r1", values: { col_reps: 8 } }]), ids);
    expect(rows.map((row) => row.id)).toEqual(["r1", "new1", "new2", "new3"]);
  });

  it("laisse les lignes des autres types telles quelles", () => {
    const block = freeBlock([{ id: "r1", values: {} }], [reps]);
    expect(fillableRows(block, ids)).toBe(block.rows);
  });
});

describe("unitValues", () => {
  it("rend les valeurs RENSEIGNÉES de la ligne, dans l'ordre des colonnes", () => {
    const block = seriesBlock([{ id: "r1", values: { col_load: 12, col_reps: 6 } }]);

    expect(unitValues(block, 0)).toEqual([
      { metric: reps, value: 6 },
      { metric: load, value: 12 },
    ]);
  });

  // « — kg » ferait passer une charge manquante pour une charge nulle.
  it("saute les colonnes vides, qu'elles soient absentes ou nulles", () => {
    const block = seriesBlock([{ id: "r1", values: { col_reps: 6, col_load: null } }]);

    expect(unitValues(block, 0)).toEqual([{ metric: reps, value: 6 }]);
  });

  it("lit la ligne de repli au-delà de la grille", () => {
    const block = seriesBlock([{ id: "r1", values: { col_reps: 8 } }]);

    expect(unitValues(block, 3)).toEqual([{ metric: reps, value: 8 }]);
  });

  it("n'a rien à rappeler sur un bloc sans ligne", () => {
    expect(unitValues(seriesBlock([]), 0)).toEqual([]);
  });
});

describe("trackableExercises", () => {
  const free = (id: string, rows: ExerciseBlock["rows"]) => ({
    ...freeBlock(rows, [reps]),
    id,
  });

  it("garde les exercices qui ont au moins une unité à décompter, dans l'ordre", () => {
    const exercises = [
      { name: "étirements", blocks: [free("b1", [])] },
      { name: "tractions", blocks: [seriesBlock([])] },
      { name: "mixte", blocks: [free("b2", []), free("b3", [{ id: "r1", values: {} }])] },
      { name: "vide", blocks: [] },
    ];

    expect(trackableExercises(exercises).map((exercise) => exercise.name)).toEqual([
      "tractions",
      "mixte",
    ]);
  });

  // L'AMRAP se décompte en tours, pas en cases : il reste un exercice à suivre.
  it("compte un AMRAP comme suivable", () => {
    const amrap = {
      ...seriesBlock([]),
      structure: { type: BlockType.AMRAP, totalDurationSeconds: 480, targetRounds: null },
    } as ExerciseBlock;

    expect(trackableExercises([{ blocks: [amrap] }])).toHaveLength(1);
  });
});

describe("structurePhrase / restPhrase — circuit", () => {
  it("annonce le nombre de tours et le repos entre tours", () => {
    const structure = {
      type: BlockType.CIRCUIT,
      roundCount: 5,
      restBetweenRoundsSeconds: 180,
    } as const;

    expect(structurePhrase(structure)).toEqual({
      key: "exercise.dosage.circuit",
      params: { count: 5 },
    });
    expect(restPhrase(structure)).toEqual({
      key: "exercise.dosage.restBetweenRounds",
      params: { rest: "3'" },
    });
  });

  it("n'invente pas de repos entre tours", () => {
    expect(
      restPhrase({ type: BlockType.CIRCUIT, roundCount: 5, restBetweenRoundsSeconds: null }),
    ).toBeNull();
  });

  // Le repos d'un EMOM ou d'un AMRAP est dans le format lui-même : aucune phrase à part.
  it("ne pose aucune phrase de repos sur un EMOM ni un AMRAP", () => {
    expect(
      restPhrase({ type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 600 }),
    ).toBeNull();
    expect(
      restPhrase({ type: BlockType.AMRAP, totalDurationSeconds: 480, targetRounds: null }),
    ).toBeNull();
  });
});

describe("trackingSummary — cas limites", () => {
  it("rend l'unité du premier bloc décomptable", () => {
    const blocks = [freeBlock([], [reps]), seriesBlock([])];

    expect(trackingSummary(blocks, null)).toEqual({
      state: TrackingState.UNTRACKED,
      done: 0,
      total: 4,
      unit: TrackingUnit.SET,
    });
  });

  it("n'a pas d'unité quand rien ne se décompte", () => {
    expect(trackingSummary([freeBlock([], [reps])], null)).toMatchObject({ total: 0, unit: null });
  });

  /**
   * Le bandeau a changé APRÈS que l'athlète a coché : des cases subsistent sur un bloc devenu
   * AMRAP. Elles ne comptent pour rien — pas de « 3 sur 0 ».
   */
  it("ignore des cases cochées sur un bloc devenu AMRAP", () => {
    const amrap = {
      ...seriesBlock([]),
      structure: { type: BlockType.AMRAP, totalDurationSeconds: 480, targetRounds: null },
    } as ExerciseBlock;

    expect(trackingSummary([amrap], { blk_1: { checked: [0, 1, 2] } })).toMatchObject({
      done: 0,
      total: 0,
    });
  });
});

describe("timerFor — durée d'effort absente ou illisible", () => {
  const series = (rows: ExerciseBlock["rows"]) =>
    seriesBlock(rows, [effortColumn]) satisfies ExerciseBlock;

  it("se contente du repos quand le bloc n'a encore aucune ligne", () => {
    expect(timerFor(series([]))).toEqual({ kind: TimerKind.REST, restSeconds: 150 });
  });

  it("se contente du repos quand la durée d'effort n'est pas renseignée", () => {
    expect(timerFor(series([{ id: "r1", values: {} }]))).toEqual({
      kind: TimerKind.REST,
      restSeconds: 150,
    });
  });

  // Une durée ne se lit que comme un nombre : un texte dans la colonne n'est pas une durée.
  it("ignore une durée d'effort qui n'est pas un nombre", () => {
    expect(timerFor(series([{ id: "r1", values: { col_effort: "30" } }]))).toEqual({
      kind: TimerKind.REST,
      restSeconds: 150,
    });
  });
});

describe("blockSegments — bloc LIBRE et grilles incomplètes", () => {
  const segments = (block: ExerciseBlock) =>
    blockSegments(block).map(({ kind, seconds, unitIndex, rowId }) => ({
      kind,
      seconds,
      unitIndex,
      rowId,
    }));

  /**
   * LIBRE : chaque ligne est une étape jouée UNE fois. Le repos vient de la ligne — il n'y a pas
   * de bandeau pour en donner un —, sous l'un OU l'autre des deux libellés, et jamais après la
   * dernière étape.
   */
  it("joue chaque étape une fois, avec le repos porté par la ligne", () => {
    const block = freeBlock(
      [
        { id: "r1", values: { col_effort: 40, col_round_rest: 90 } },
        { id: "r2", values: { col_effort: 20 } },
        { id: "r3", values: { col_effort: 30, col_round_rest: 60 } },
      ],
      [effortColumn, roundRestColumn],
    );

    expect(segments(block)).toEqual([
      { kind: SegmentKind.EFFORT, seconds: 40, unitIndex: 0, rowId: "r1" },
      { kind: SegmentKind.REST, seconds: 90, unitIndex: 0, rowId: "r1" },
      { kind: SegmentKind.EFFORT, seconds: 20, unitIndex: 1, rowId: "r2" },
      { kind: SegmentKind.EFFORT, seconds: 30, unitIndex: 2, rowId: "r3" },
    ]);
  });

  it("attend un geste sur une étape sans durée d'effort", () => {
    const block = freeBlock([{ id: "r1", values: { col_reps: 8 } }], [reps]);

    expect(segments(block)).toEqual([
      { kind: SegmentKind.MANUAL, seconds: 0, unitIndex: 0, rowId: "r1" },
    ]);
  });

  it("ne déroule rien d'un bloc libre sans ligne", () => {
    expect(blockSegments(freeBlock([], [reps]))).toEqual([]);
  });

  /**
   * Des séries sans grille (le coach n'a posé que le bandeau) restent déroulables : chaque série
   * attend un geste, le repos du bandeau les sépare. Aucune ligne à citer.
   */
  it("déroule des séries sans ligne en gestes séparés par le repos du bandeau", () => {
    const block = seriesBlock([], [effortColumn]);

    expect(segments(block)).toEqual([
      { kind: SegmentKind.MANUAL, seconds: 0, unitIndex: 0, rowId: null },
      { kind: SegmentKind.REST, seconds: 150, unitIndex: 0, rowId: null },
      { kind: SegmentKind.MANUAL, seconds: 0, unitIndex: 1, rowId: null },
      { kind: SegmentKind.REST, seconds: 150, unitIndex: 1, rowId: null },
      { kind: SegmentKind.MANUAL, seconds: 0, unitIndex: 2, rowId: null },
      { kind: SegmentKind.REST, seconds: 150, unitIndex: 2, rowId: null },
      { kind: SegmentKind.MANUAL, seconds: 0, unitIndex: 3, rowId: null },
    ]);
  });

  it("n'associe aucune ligne aux tops d'un EMOM sans grille", () => {
    const emom = {
      ...seriesBlock([]),
      structure: { type: BlockType.EMOM, intervalSeconds: 60, totalDurationSeconds: 120 },
    } as ExerciseBlock;

    expect(segments(emom)).toEqual([
      { kind: SegmentKind.INTERVAL, seconds: 60, unitIndex: 0, rowId: null },
      { kind: SegmentKind.INTERVAL, seconds: 60, unitIndex: 1, rowId: null },
    ]);
  });
});

describe("segmentsDuration — rien à dérouler", () => {
  // `null` et non 0 : « aucun déroulé » n'est pas « un déroulé de zéro seconde » (règle n°5).
  it("rend null quand il n'y a aucun segment", () => {
    expect(segmentsDuration([])).toBeNull();
  });
});
