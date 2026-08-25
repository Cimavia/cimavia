import { describe, expect, it } from "vitest";
import {
  AdjustmentLevel,
  type Adjustments,
  adjustmentLevelAt,
  adjustmentsSchema,
  cellPath,
  clearAdjustment,
  isPathInRow,
  lockedShapeIssues,
  markAdjusted,
  resetRow,
  resetToBaseline,
  structurePath,
} from "./dosage-override.schema";
import { BlockType, type ExerciseBlocks, MetricSource } from "./exercise-block.schema";
import { MetricKey, MetricUnit } from "./exercise-metric.schema";

const column = (id: string, key: MetricKey) => ({
  id,
  source: MetricSource.CATALOG,
  key,
  unit: MetricUnit.REPS,
  label: null,
  collapsed: false,
});

const blocks = (): ExerciseBlocks => [
  {
    id: "blk_1",
    label: "Travail",
    structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: 150 },
    metrics: [column("col_reps", MetricKey.REPETITIONS)],
    rows: [
      { id: "r1", values: { col_reps: 6 } },
      { id: "r2", values: { col_reps: 5 } },
    ],
  },
];

describe("chemins", () => {
  it("désigne une cellule et un paramètre de bandeau", () => {
    expect(cellPath("blk_1", "r1", "col_reps")).toBe("blk_1/rows/r1/col_reps");
    expect(structurePath("blk_1", "setCount")).toBe("blk_1/structure/setCount");
  });

  it("reconnaît les chemins d'UNE ligne, pas ceux d'une autre", () => {
    expect(isPathInRow(cellPath("blk_1", "r1", "col_reps"), "blk_1", "r1")).toBe(true);
    expect(isPathInRow(cellPath("blk_1", "r2", "col_reps"), "blk_1", "r1")).toBe(false);
    // Le bandeau n'appartient à aucune ligne : « Revenir au défaut » sur une ligne ne doit pas
    // réinitialiser le nombre de séries du bloc.
    expect(isPathInRow(structurePath("blk_1", "setCount"), "blk_1", "r1")).toBe(false);
  });
});

describe("marqueurs", () => {
  const path = cellPath("blk_1", "r1", "col_reps");

  it("pose et retire un marqueur", () => {
    const marked = markAdjusted([], path, AdjustmentLevel.SESSION);
    expect(adjustmentLevelAt(marked, path)).toBe(AdjustmentLevel.SESSION);
    expect(adjustmentLevelAt(clearAdjustment(marked, path), path)).toBeNull();
  });

  it("laisse le dernier niveau décider", () => {
    // Le marqueur doit dire qui décide AUJOURD'HUI de ce que voit l'athlète, pas qui a décidé
    // en premier.
    const marked = markAdjusted(
      markAdjusted([], path, AdjustmentLevel.SESSION),
      path,
      AdjustmentLevel.SCHEDULED,
    );
    expect(marked).toHaveLength(1);
    expect(adjustmentLevelAt(marked, path)).toBe(AdjustmentLevel.SCHEDULED);
  });

  it("refuse deux ajustements sur le même chemin", () => {
    const doubled: Adjustments = [
      { path, level: AdjustmentLevel.SESSION },
      { path, level: AdjustmentLevel.SCHEDULED },
    ];
    expect(adjustmentsSchema.safeParse(doubled).success).toBe(false);
  });
});

/** Les mutations d'essai passent par des copies : `!` est interdit par la porte qualité. */
const withRowValues = (
  source: ExerciseBlocks,
  rowId: string,
  values: Record<string, number>,
): ExerciseBlocks =>
  source.map((block) => ({
    ...block,
    rows: block.rows.map((row) => (row.id === rowId ? { ...row, values } : row)),
  }));

const withExtraRow = (source: ExerciseBlocks, row: ExerciseBlocks[number]["rows"][number]) =>
  source.map((block) => ({ ...block, rows: [...block.rows, row] }));

const firstBlock = (source: ExerciseBlocks) => {
  const block = source.at(0);
  if (block == null) throw new Error("le fixture porte au moins un bloc");
  return block;
};

describe("resetRow", () => {
  it("restaure les valeurs de la ligne et retire ses seuls marqueurs", () => {
    const baseline = blocks();
    const edited = withRowValues(blocks(), "r1", { col_reps: 12 });

    const adjustments: Adjustments = [
      { path: cellPath("blk_1", "r1", "col_reps"), level: AdjustmentLevel.SESSION },
      { path: cellPath("blk_1", "r2", "col_reps"), level: AdjustmentLevel.SESSION },
    ];

    const next = resetRow(edited, baseline, adjustments, "blk_1", "r1");
    expect(next.blocks[0]?.rows[0]?.values).toEqual({ col_reps: 6 });
    // La ligne 2 garde le sien : on revient au défaut SUR UNE LIGNE, pas sur le bloc.
    expect(next.adjustments.map((item) => item.path)).toEqual([
      cellPath("blk_1", "r2", "col_reps"),
    ]);
  });

  it("laisse en place une ligne ajoutée, absente de la référence", () => {
    // La retirer serait une suppression déguisée derrière un bouton qui dit « revenir ».
    const edited = withExtraRow(blocks(), { id: "r3", values: { col_reps: 9 } });

    const next = resetRow(edited, blocks(), [], "blk_1", "r3");
    expect(next.blocks[0]?.rows).toHaveLength(3);
    expect(next.blocks[0]?.rows[2]?.values).toEqual({ col_reps: 9 });
  });
});

describe("resetToBaseline", () => {
  it("rend les valeurs copiées à l'ajout et efface tous les marqueurs", () => {
    const baseline = blocks();
    const next = resetToBaseline(baseline);
    expect(next.blocks).toEqual(baseline);
    expect(next.adjustments).toEqual([]);
  });

  it("rend une COPIE — éditer le résultat ne doit pas toucher la référence", () => {
    const baseline = blocks();
    const next = resetToBaseline(baseline);
    const row = firstBlock(next.blocks).rows.at(0);
    if (row == null) throw new Error("la copie porte les lignes de la référence");
    row.values.col_reps = 99;
    expect(baseline.at(0)?.rows.at(0)?.values).toEqual({ col_reps: 6 });
  });
});

describe("lockedShapeIssues", () => {
  it("ne signale rien quand seules les VALEURS changent", () => {
    expect(lockedShapeIssues(blocks(), withRowValues(blocks(), "r1", { col_reps: 12 }))).toEqual(
      [],
    );
  });

  it("autorise le bandeau et le nombre de lignes", () => {
    // Ce sont précisément les trois libertés du niveau séance.
    const next = withExtraRow(blocks(), { id: "r3", values: { col_reps: 4 } }).map((block) => ({
      ...block,
      structure: { type: BlockType.SERIES, setCount: 6, restBetweenSetsSeconds: null } as const,
    }));
    expect(lockedShapeIssues(blocks(), next)).toEqual([]);
  });

  const mapFirst = (change: (block: ExerciseBlocks[number]) => ExerciseBlocks[number]) =>
    blocks().map(change);

  it.each([
    [
      "le type de structure",
      () => mapFirst((b) => ({ ...b, structure: { type: BlockType.FREE } })),
    ],
    ["le libellé du bloc", () => mapFirst((b) => ({ ...b, label: "Échauffement" }))],
    [
      "le jeu de colonnes",
      () => mapFirst((b) => ({ ...b, metrics: [column("col_load", MetricKey.LOAD)] })),
    ],
    ["le nombre de blocs", () => [] as ExerciseBlocks],
  ])("refuse un changement de %s", (_label, build) => {
    expect(lockedShapeIssues(blocks(), build()).length).toBeGreaterThan(0);
  });

  it("refuse un simple réordonnancement de colonnes", () => {
    // Réordonner change ce que l'athlète LIT, même si le jeu de colonnes est identique.
    const pair = [column("a", MetricKey.REPETITIONS), column("b", MetricKey.LOAD)];
    const baseline = blocks().map((block) => ({ ...block, metrics: pair }));
    const next = blocks().map((block) => ({ ...block, metrics: [...pair].reverse() }));
    expect(lockedShapeIssues(baseline, next).length).toBeGreaterThan(0);
  });
});

describe("le verrou couvre la DÉFINITION des colonnes", () => {
  const withMetric = (metric: ExerciseBlocks[number]["metrics"][number]): ExerciseBlocks =>
    blocks().map((block) => ({ ...block, metrics: [metric] }));

  it("refuse un changement d'unité", () => {
    // « 6 » en kilos et « 6 » en pourcentage du poids de corps ne sont pas le même effort.
    const next = withMetric({
      ...column("col_reps", MetricKey.REPETITIONS),
      unit: MetricUnit.REPS_PER_SIDE,
    });
    expect(lockedShapeIssues(blocks(), next).length).toBeGreaterThan(0);
  });

  it("refuse un changement de libellé de colonne", () => {
    const next = withMetric({ ...column("col_reps", MetricKey.REPETITIONS), label: "Passages" });
    expect(lockedShapeIssues(blocks(), next).length).toBeGreaterThan(0);
  });

  it("AUTORISE le repli d'une colonne — c'est de l'affichage, pas de la donnée", () => {
    const next = withMetric({ ...column("col_reps", MetricKey.REPETITIONS), collapsed: true });
    expect(lockedShapeIssues(blocks(), next)).toEqual([]);
  });
});
