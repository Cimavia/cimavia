import { describe, expect, it } from "vitest";
// Depuis l'index : ces tests décrivent ce que les écrans appellent, pas l'emplacement du module.
import {
  AdjustmentLevel,
  type Adjustments,
  adjustCell,
  adjustmentLevelAt,
  adjustRows,
  adjustStructure,
  BlockType,
  cellPath,
  type DosageEditable,
  type DosageScope,
  type ExerciseBlocks,
  MetricKey,
  MetricSource,
  MetricUnit,
  resetAllAdjustments,
  revertCell,
  revertRow,
  revertStructureField,
  structurePath,
} from "../index";

const LOAD = cellPath("blk", "r1", "load");
const LOAD_R2 = cellPath("blk", "r2", "load");
const SET_COUNT = structurePath("blk", "setCount");

const blocks = (load: number, setCount = 4): ExerciseBlocks => [
  {
    id: "blk",
    label: null,
    structure: { type: BlockType.SERIES, setCount, restBetweenSetsSeconds: 180 },
    metrics: [
      {
        id: "load",
        source: MetricSource.CATALOG,
        key: MetricKey.LOAD,
        unit: MetricUnit.KILOGRAMS,
        label: null,
        collapsed: false,
      },
    ],
    rows: [
      { id: "r1", values: { load } },
      { id: "r2", values: { load } },
    ],
  },
];

const valueAt = (item: DosageEditable, rowId: string) =>
  item.blocks[0]?.rows.find((row) => row.id === rowId)?.values.load;

const SESSION: DosageScope = { level: AdjustmentLevel.SESSION, reference: [] };

/**
 * Le scénario de #518 : Tractions lestées à +10 kg en bibliothèque, passées à +12 kg dans la
 * séance-type (● rond), diffusées à Léa. La séance planifiée reçoit +12 kg ET le rond.
 */
const RECEIVED: Adjustments = [
  { path: LOAD, level: AdjustmentLevel.SESSION },
  { path: LOAD_R2, level: AdjustmentLevel.SESSION },
];
const SCHEDULED: DosageScope = { level: AdjustmentLevel.SCHEDULED, reference: RECEIVED };
const forLea = (): DosageEditable => ({
  blocks: blocks(12),
  baseline: blocks(12),
  adjustments: RECEIVED,
});

describe("au niveau séance planifiée", () => {
  it("+14 kg pour Léa : la valeur change et le rond devient carré", () => {
    const next = adjustCell(
      forLea(),
      SCHEDULED,
      { blockId: "blk", rowId: "r1", metricId: "load" },
      14,
    );

    expect(valueAt(next, "r1")).toBe(14);
    expect(adjustmentLevelAt(next.adjustments, LOAD)).toBe(AdjustmentLevel.SCHEDULED);
    // L'autre ligne garde le rond de la séance.
    expect(adjustmentLevelAt(next.adjustments, LOAD_R2)).toBe(AdjustmentLevel.SESSION);
  });

  it("« Revenir » sur la cellule rend +12 kg ET le rond de la séance, pas une cellule nue", () => {
    const at = { blockId: "blk", rowId: "r1", metricId: "load" };
    const next = revertCell(adjustCell(forLea(), SCHEDULED, at, 14), SCHEDULED, at);

    expect(valueAt(next, "r1")).toBe(12);
    expect(next.adjustments).toEqual(RECEIVED);
  });

  it("« Revenir au défaut » sur la ligne rend +12 kg et le rond", () => {
    const at = { blockId: "blk", rowId: "r1", metricId: "load" };
    const next = revertRow(adjustCell(forLea(), SCHEDULED, at, 14), SCHEDULED, "blk", "r1");

    expect(valueAt(next, "r1")).toBe(12);
    expect(next.adjustments).toEqual(RECEIVED);
  });

  it("« Tout réinitialiser » garde les ronds des cellules jamais touchées pour Léa", () => {
    const touched = adjustStructure(
      adjustCell(forLea(), SCHEDULED, { blockId: "blk", rowId: "r1", metricId: "load" }, 14),
      SCHEDULED,
      "blk",
      { type: BlockType.SERIES, setCount: 5, restBetweenSetsSeconds: 180 },
    );

    const next = resetAllAdjustments(touched, SCHEDULED);

    expect(next.blocks).toEqual(blocks(12));
    expect(next.adjustments).toEqual(RECEIVED);
  });

  it("un paramètre de bandeau ramené à la main à sa valeur reçue reprend le marqueur reçu", () => {
    const received: Adjustments = [{ path: SET_COUNT, level: AdjustmentLevel.SESSION }];
    const scope = { level: AdjustmentLevel.SCHEDULED, reference: received };
    const item = { blocks: blocks(12), baseline: blocks(12), adjustments: received };
    const structure = (setCount: number) => ({
      type: BlockType.SERIES,
      setCount,
      restBetweenSetsSeconds: 180,
    });

    const raised = adjustStructure(item, scope, "blk", structure(5));
    expect(adjustmentLevelAt(raised.adjustments, SET_COUNT)).toBe(AdjustmentLevel.SCHEDULED);

    const back = adjustStructure(raised, scope, "blk", structure(4));
    expect(back.adjustments).toEqual(received);
  });

  it("« Revenir » sur un paramètre de bandeau rend la valeur et le marqueur reçus", () => {
    const received: Adjustments = [{ path: SET_COUNT, level: AdjustmentLevel.SESSION }];
    const scope = { level: AdjustmentLevel.SCHEDULED, reference: received };
    const item = { blocks: blocks(12, 5), baseline: blocks(12), adjustments: [] };

    const next = revertStructureField(item, scope, "blk", "setCount");

    expect(next.blocks[0]?.structure).toEqual(blocks(12)[0]?.structure);
    expect(next.adjustments).toEqual(received);
  });
});

describe("au niveau séance — comportement de #165, inchangé", () => {
  const fromLibrary = (): DosageEditable => ({
    blocks: blocks(10),
    baseline: blocks(10),
    adjustments: [],
  });

  it("une valeur ajustée porte le rond, et « Revenir » le retire", () => {
    const at = { blockId: "blk", rowId: "r1", metricId: "load" };
    const marked = adjustCell(fromLibrary(), SESSION, at, 12);
    expect(adjustmentLevelAt(marked.adjustments, LOAD)).toBe(AdjustmentLevel.SESSION);

    const reverted = revertCell(marked, SESSION, at);
    expect(valueAt(reverted, "r1")).toBe(10);
    expect(reverted.adjustments).toEqual([]);
  });

  it("« Tout réinitialiser » efface tous les marqueurs", () => {
    const at = { blockId: "blk", rowId: "r2", metricId: "load" };
    expect(resetAllAdjustments(adjustCell(fromLibrary(), SESSION, at, 12), SESSION)).toEqual(
      fromLibrary(),
    );
  });

  it("ne marque pas une valeur d'une ligne absente de la référence", () => {
    const rows = [...(blocks(10)[0]?.rows ?? []), { id: "r3", values: { load: 10 } }];
    const added = adjustRows(fromLibrary(), "blk", rows);
    expect(added.adjustments).toEqual([]);

    const typed = adjustCell(added, SESSION, { blockId: "blk", rowId: "r3", metricId: "load" }, 15);
    expect(valueAt(typed, "r3")).toBe(15);
    expect(typed.adjustments).toEqual([]);
    // Rien à quoi revenir : la ligne reste telle quelle.
    expect(revertCell(typed, SESSION, { blockId: "blk", rowId: "r3", metricId: "load" })).toBe(
      typed,
    );
  });
});

describe("un exercice sans référence — ajouté dans le panneau, sa référence est lui-même", () => {
  const added = (): DosageEditable => ({ blocks: blocks(10), baseline: [], adjustments: [] });

  it("ne pose aucun marqueur, ni en cellule ni en bandeau", () => {
    const typed = adjustCell(
      added(),
      SCHEDULED,
      { blockId: "blk", rowId: "r1", metricId: "load" },
      14,
    );
    const banded = adjustStructure(typed, SCHEDULED, "blk", {
      type: BlockType.SERIES,
      setCount: 6,
      restBetweenSetsSeconds: 180,
    });

    expect(valueAt(banded, "r1")).toBe(14);
    expect(banded.blocks[0]?.structure).toMatchObject({ setCount: 6 });
    expect(banded.adjustments).toEqual([]);
  });

  it("n'a rien à quoi revenir sur un paramètre de bandeau", () => {
    const item = added();
    expect(revertStructureField(item, SCHEDULED, "blk", "setCount")).toBe(item);
  });

  it("garde le reste de la ligne de l'écran", () => {
    const item = { ...added(), key: "k-1", note: "Épaule sensible" };
    expect(adjustRows(item, "blk", [])).toMatchObject({ key: "k-1", note: "Épaule sensible" });
  });
});

/**
 * Un exercice à plusieurs blocs — échauffement puis travail : chaque geste ne touche que le bloc
 * qu'il vise, valeurs, bandeau et lignes compris.
 */
describe("sur un exercice à plusieurs blocs", () => {
  const twoBlocks = (load: number, setCount = 4): ExerciseBlocks => [
    ...blocks(10),
    { ...(blocks(load, setCount)[0] as ExerciseBlocks[number]), id: "blk2", label: "Travail" },
  ];
  const item = (): DosageEditable => ({
    blocks: twoBlocks(12),
    baseline: twoBlocks(12),
    adjustments: [],
  });
  const series = (setCount: number) => ({
    type: BlockType.SERIES,
    setCount,
    restBetweenSetsSeconds: 180,
  });

  it("une valeur ajustée ne touche que son bloc", () => {
    const next = adjustCell(
      item(),
      SESSION,
      { blockId: "blk2", rowId: "r1", metricId: "load" },
      14,
    );

    expect(next.blocks[0]).toEqual(twoBlocks(12)[0]);
    expect(next.blocks[1]?.rows[0]?.values.load).toBe(14);
    expect(next.adjustments).toEqual([
      { path: cellPath("blk2", "r1", "load"), level: AdjustmentLevel.SESSION },
    ]);
  });

  it("un paramètre de bandeau ajusté, puis rendu, ne touche que son bloc", () => {
    const raised = adjustStructure(item(), SESSION, "blk2", series(5));
    expect(raised.blocks[0]?.structure).toEqual(series(4));
    expect(raised.blocks[1]?.structure).toEqual(series(5));

    const back = revertStructureField(raised, SESSION, "blk2", "setCount");
    expect(back.blocks).toEqual(twoBlocks(12));
    expect(back.adjustments).toEqual([]);
  });

  it("les lignes d'un bloc changent sans toucher à celles de l'autre", () => {
    const next = adjustRows(item(), "blk2", []);

    expect(next.blocks[0]?.rows).toHaveLength(2);
    expect(next.blocks[1]?.rows).toEqual([]);
  });
});

describe("une cellule vide dans la référence", () => {
  it("redevient vide quand on y revient, plutôt que de garder la valeur tapée", () => {
    const empty = blocks(10).map((block) => ({
      ...block,
      rows: block.rows.map((row) => ({ ...row, values: {} })),
    }));
    const at = { blockId: "blk", rowId: "r1", metricId: "load" };
    const typed = adjustCell({ blocks: empty, baseline: empty, adjustments: [] }, SESSION, at, 14);

    const back = revertCell(typed, SESSION, at);

    expect(valueAt(back, "r1")).toBeNull();
    expect(back.adjustments).toEqual([]);
  });
});
