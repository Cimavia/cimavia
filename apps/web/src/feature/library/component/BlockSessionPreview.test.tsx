import {
  type BlockGrid,
  type GridMetric,
  MetricKey,
  MetricSource,
  MetricUnit,
  type SessionBlock,
  STRUCTURE_PRESETS,
  StructurePresetKey,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { BlockSessionPreview } from "./BlockSessionPreview";

const reps: GridMetric = {
  id: "reps",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
};

const gridOf = (...values: (number | null)[]): BlockGrid => ({
  metrics: [reps],
  rows: values.map((value, index) => ({ id: `r${index}`, values: { reps: value } })),
});

const exercise = (key: string, grid: BlockGrid, note: string | null = null) => ({
  key,
  exerciseId: `ex-${key}`,
  note,
  grid,
});

function blockOf(
  id: string,
  exercises: SessionBlock["exercises"],
  over: Partial<SessionBlock> = {},
) {
  const settings = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
  return {
    id,
    name: "Séries",
    label: null,
    instructions: null,
    settings,
    copiedSettings: settings,
    sourceStructureId: null,
    sourcePreset: StructurePresetKey.SERIES,
    exercises,
    ...over,
  } satisfies SessionBlock;
}

const TITLES: Record<string, string> = { a: "Tractions", b: "Gainage" };

function mount(blocks: SessionBlock[]) {
  return renderWithProviders(
    <BlockSessionPreview
      blocks={blocks}
      titleOf={(key) => TITLES[key] ?? null}
      customMetrics={[]}
    />,
  );
}

describe("BlockSessionPreview", () => {
  it("annonce qu'il se remplira, tant que la séance n'a pas de bloc", () => {
    const view = mount([]);

    expect(view.getByText("library.session.previewEmpty")).toBeInTheDocument();
  });

  it("lit chaque bloc sous sa lettre, chaque exercice sous son code", () => {
    const view = mount([
      blockOf("b-1", [exercise("a", gridOf(8)), exercise("b", gridOf(30))]),
      blockOf("b-2", [exercise("a", gridOf())], { label: "Retour au calme" }),
    ]);

    expect(view.getByRole("heading", { name: "A" })).toBeInTheDocument();
    expect(view.getByText("A1")).toBeInTheDocument();
    expect(view.getByText("A2")).toBeInTheDocument();
    // Un bloc à libellé ne prend pas de lettre, et ses exercices pas de code.
    expect(view.getByRole("heading", { name: "Retour au calme" })).toBeInTheDocument();
    expect(view.getAllByText("Tractions")).toHaveLength(2);
  });

  it("lit des valeurs identiques à chaque tour en une phrase, des valeurs qui changent ligne à ligne", () => {
    const view = mount([
      blockOf("b-1", [exercise("a", gridOf(8, 8)), exercise("b", gridOf(10, 8, 6))]),
    ]);

    // La phrase : « À chaque tour : 8 répétitions ».
    expect(view.getByText(/block\.grid\.eachRound/)).toBeInTheDocument();
    // Les lignes : « Tour 1 · … », « Tour 2 · … », « Tour 3 · … ».
    expect(
      view
        .getAllByRole("listitem")
        .filter((item) => item.textContent?.startsWith("block.grid.round")),
    ).toHaveLength(3);
  });

  it("montre la consigne du bloc et la note de l'exercice, un titre inconnu en tiret", () => {
    const view = mount([
      blockOf("b-1", [exercise("z", gridOf(), "Épaule sensible")], { instructions: "Reste gainé" }),
    ]);

    expect(view.getByText("Reste gainé")).toBeInTheDocument();
    expect(view.getByText("Épaule sensible")).toBeInTheDocument();
    expect(view.getByText("—")).toBeInTheDocument();
  });
});
