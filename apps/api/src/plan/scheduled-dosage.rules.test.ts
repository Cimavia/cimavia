import {
  type BlockGrid,
  CompositionOrigin,
  type CustomMetric,
  type DosageSessionInput,
  type ScheduledSessionBlockDto,
  STRUCTURE_PRESETS,
  StructurePresetKey,
  StructureRepeat,
  type StructureSettings,
} from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { dosedBlocks } from "./scheduled-dosage.rules";

const SERIES: StructureSettings = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const load = { id: "col_load", source: "CATALOG", key: "LOAD", unit: "KILOGRAMS", label: null };
const cotation = { id: "col_cot", source: "CUSTOM", customMetricId: "cm-1", label: null };

const gridOf = (value: unknown, metrics: unknown[] = [load]) =>
  ({
    metrics,
    rows: [{ id: "r1", values: { [(metrics[0] as { id: string }).id]: value } }],
  }) as BlockGrid;

/** Un bloc de Séries stocké : Tractions (`a1`) reçue, à 60 kg. */
const stored = [
  {
    id: "blk",
    name: "Séries",
    label: null,
    instructions: null,
    settings: SERIES,
    copiedSettings: SERIES,
    sourceStructureId: null,
    sourcePreset: StructurePresetKey.SERIES,
    baseline: {
      settings: SERIES,
      exercises: [{ key: "a1", exerciseId: "ex-a", note: null, grid: gridOf(60) }],
    },
    tracking: null,
    exercises: [
      {
        id: "row-a1",
        key: "a1",
        note: null,
        grid: gridOf(60),
        origin: { kind: CompositionOrigin.RECEIVED },
      },
    ],
  },
] as ScheduledSessionBlockDto[];

const sent = (
  grid: BlockGrid,
  settings = SERIES,
  exercise: Partial<{ key: string }> = {},
): DosageSessionInput["blocks"] => [
  { id: "blk", settings, exercises: [{ key: "a1", grid, ...exercise }] },
];

const noFrozen = () => [];

describe("dosedBlocks", () => {
  it("prend les valeurs envoyées et garde le reste de la copie stockée", () => {
    const settings = { ...SERIES, restBetweenRoundsSeconds: 90 };
    const [block] = dosedBlocks(stored, sent(gridOf(70), settings), noFrozen);

    expect(block).toMatchObject({
      id: "blk",
      name: "Séries",
      settings,
      baseline: stored[0]?.baseline,
    });
    expect(block?.exercises[0]).toMatchObject({
      id: "row-a1",
      origin: { kind: CompositionOrigin.RECEIVED },
      grid: gridOf(70),
    });
  });

  it.each([
    [
      "un autre bloc",
      [{ id: "autre", settings: SERIES, exercises: [{ key: "a1", grid: gridOf(60) }] }],
    ],
    ["un autre exercice", sent(gridOf(60), SERIES, { key: "x1" })],
    ["une colonne renommée", sent(gridOf(60, [{ ...load, id: "col_autre" }]))],
    ["un bloc de moins", []],
  ])("refuse %s : la composition ne change pas ici", (_label, blocks) => {
    expect(() => dosedBlocks(stored, blocks, noFrozen)).toThrow(
      "Dosage ne change pas la composition de la séance",
    );
  });

  it("refuse plus de lignes que l'exercice n'a de tours", () => {
    const twoRounds = { ...SERIES, repeat: { kind: StructureRepeat.ROUNDS, rounds: 2 } };
    const rows = ["r1", "r2", "r3"].map((id) => ({ id, values: {} }));

    expect(() => dosedBlocks(stored, sent({ ...gridOf(60), rows }, twoRounds), noFrozen)).toThrow(
      "La grille a plus de lignes que l'exercice n'a de tours ou de passages.",
    );
  });

  it("refuse une forme de réglages que la séance-type n'a pas donnée", () => {
    const once = {
      ...SERIES,
      repeat: { kind: StructureRepeat.ONCE },
      restBetweenRoundsSeconds: null,
    };

    expect(() => dosedBlocks(stored, sent(gridOf(60), once), noFrozen)).toThrow(
      "Structure verrouillée au niveau séance planifiée",
    );
  });

  it("refuse une valeur d'un autre type que sa colonne", () => {
    expect(() => dosedBlocks(stored, sent(gridOf("lourd")), noFrozen)).toThrow(BadRequestException);
  });

  it("valide une colonne maison contre la définition que la ligne a figée", () => {
    const withCustom = structuredClone(stored);
    const grid = gridOf(7, [cotation]);
    for (const block of withCustom) {
      block.baseline.exercises[0] = { ...block.baseline.exercises[0], grid } as never;
      block.exercises[0] = { ...block.exercises[0], grid } as never;
    }
    const frozen = [
      { id: "cm-1", label: "Cotation", unit: null, valueType: "NUMBER", scale: null },
    ] as unknown as CustomMetric[];
    const frozenOf = (rowId: string) => (rowId === "row-a1" ? frozen : []);

    expect(() => dosedBlocks(withCustom, sent(gridOf("7a", [cotation])), frozenOf)).toThrow(
      BadRequestException,
    );
    // Sa définition perdue (EX-2), la colonne garde ses valeurs sans bloquer la copie…
    expect(() => dosedBlocks(withCustom, sent(gridOf(7, [cotation])), noFrozen)).not.toThrow();
    // … mais elles ne se changent plus : rien ne dirait plus ce qu'elles valent.
    expect(() => dosedBlocks(withCustom, sent(gridOf("7a", [cotation])), noFrozen)).toThrow(
      "Une métrique maison sans définition ne se dose pas",
    );
  });

  it("laisse une série recopiée reprendre une valeur orpheline, et une ligne retirée emporter la sienne", () => {
    const withCustom = structuredClone(stored);
    const both = [load, cotation];
    const before = {
      metrics: both,
      rows: [{ id: "r1", values: { col_load: 60, col_cot: 7 } }],
    } as BlockGrid;
    for (const block of withCustom) {
      block.baseline.exercises[0] = { ...block.baseline.exercises[0], grid: before } as never;
      block.exercises[0] = { ...block.exercises[0], grid: before } as never;
    }
    const copied = (...loads: number[]) =>
      ({
        metrics: both,
        rows: loads.map((kg, index) => ({
          id: index === 0 ? "r1" : `new-${index}`,
          values: { col_load: kg, col_cot: 7 },
        })),
      }) as BlockGrid;

    // 60 / 60 / 70 : les deux séries neuves recopient la cotation de la première.
    expect(() => dosedBlocks(withCustom, sent(copied(60, 60, 70)), noFrozen)).not.toThrow();
    // Une valeur que la colonne n'avait pas, même sur une ligne neuve : refusée.
    const invented = copied(60, 60);
    (invented.rows[1] as { values: Record<string, unknown> }).values.col_cot = 9;
    expect(() => dosedBlocks(withCustom, sent(invented), noFrozen)).toThrow(BadRequestException);
    // Une ligne gardée qui perd sa valeur : c'est la changer.
    const emptied = { metrics: both, rows: [{ id: "r1", values: { col_load: 65 } }] } as BlockGrid;
    expect(() => dosedBlocks(withCustom, sent(emptied), noFrozen)).toThrow(BadRequestException);
    // Une ligne retirée emporte la sienne : rien de neuf n'est écrit.
    const shorter = {
      metrics: both,
      rows: [{ id: "new-1", values: { col_load: 60 } }],
    } as BlockGrid;
    expect(() => dosedBlocks(withCustom, sent(shorter), noFrozen)).not.toThrow();
  });
});
