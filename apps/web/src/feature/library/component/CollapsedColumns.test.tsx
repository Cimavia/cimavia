import {
  type BlockMetric,
  BlockType,
  type ExerciseBlock,
  MetricKey,
  MetricSource,
  MetricUnit,
} from "@cmv/shared";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { CollapsedColumns } from "./CollapsedColumns";

const column = (id: string, key: MetricKey, unit: MetricUnit, collapsed: boolean): BlockMetric => ({
  id,
  source: MetricSource.CATALOG,
  key,
  unit,
  label: null,
  collapsed,
});

const block = (metrics: BlockMetric[], rows: ExerciseBlock["rows"]): ExerciseBlock => ({
  id: "block-1",
  label: null,
  structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: null },
  metrics,
  rows,
});

const load = column("load", MetricKey.LOAD, MetricUnit.KILOGRAMS, true);
const rest = column("rest", MetricKey.REST_BETWEEN_SETS, MetricUnit.NONE, true);
const reps = column("reps", MetricKey.REPETITIONS, MetricUnit.REPS, false);

const rows: ExerciseBlock["rows"] = [
  { id: "r1", values: { load: 20, rest: 90, reps: 5 } },
  { id: "r2", values: { load: 20, rest: 90, reps: 3 } },
];

/** Le parent GARDE le bloc, comme `StructureSection` : la valeur réécrite se relit à l'écran. */
function Harness({
  initial,
  onBlock,
}: Readonly<{ initial: ExerciseBlock; onBlock: (block: ExerciseBlock) => void }>) {
  const [current, setCurrent] = useState(initial);
  return (
    <CollapsedColumns
      block={current}
      customMetrics={[]}
      onChange={(next) => {
        setCurrent(next);
        onBlock(next);
      }}
    />
  );
}

function setup(initial: ExerciseBlock) {
  const onBlock = vi.fn();
  const view = renderWithProviders(<Harness initial={initial} onBlock={onBlock} />);
  const last = () => onBlock.mock.lastCall?.[0] as ExerciseBlock;
  return { ...view, onBlock, last };
}

describe("CollapsedColumns", () => {
  it("ne rend rien quand aucune colonne n'est repliée", () => {
    const { queryByRole } = setup(block([{ ...load, collapsed: false }, reps], rows));

    expect(queryByRole("textbox")).not.toBeInTheDocument();
    expect(queryByRole("button")).not.toBeInTheDocument();
  });

  it("montre chaque colonne repliée avec sa valeur commune, et elles seules", () => {
    const { getAllByRole, getByText, queryByText } = setup(block([load, rest, reps], rows));

    expect(getByText(/^exercise\.metric\.load/)).toBeInTheDocument();
    expect(getByText(/^exercise\.metric\.restBetweenSets/)).toBeInTheDocument();
    expect(queryByText(/^exercise\.metric\.repetitions/)).not.toBeInTheDocument();
    expect(getAllByRole("textbox").map((cell) => (cell as HTMLInputElement).value)).toEqual([
      "20",
      "1'30",
    ]);
  });

  // L'unité reste lisible à côté du libellé ; une colonne sans unité n'en affiche pas.
  it("affiche l'unité d'une colonne qui en a une, et aucune pour les autres", () => {
    const { getAllByText } = setup(block([load, rest], rows));

    expect(getAllByText(/·/)).toHaveLength(1);
    expect(getAllByText(/·/)[0]).toHaveTextContent("exercise.unit.kilograms");
  });

  it("montre une colonne repliée sans ligne comme vide, pas comme zéro", () => {
    const { getByRole } = setup(block([load], []));

    expect(getByRole("textbox")).toHaveValue("");
  });

  // La valeur vit dans les LIGNES : l'éditer les réécrit toutes, et le repli reste réversible.
  it("réécrit la valeur dans toutes les lignes, sans toucher aux autres colonnes", async () => {
    const { user, getAllByRole, last } = setup(block([load, reps], rows));

    const cell = getAllByRole("textbox")[0] as HTMLElement;
    await user.clear(cell);
    await user.type(cell, "25");
    await user.tab();

    expect(last().rows.map((row) => row.values)).toEqual([
      { load: 25, rest: 90, reps: 5 },
      { load: 25, rest: 90, reps: 3 },
    ]);
  });

  it("redéploie la colonne désignée, et elle seule", async () => {
    const { user, getAllByRole, last } = setup(block([load, rest, reps], rows));

    await user.click(
      getAllByRole("button", { name: "library.builder.column.expand" })[1] as HTMLElement,
    );

    expect(last().metrics.map((metric) => [metric.id, metric.collapsed])).toEqual([
      ["load", true],
      ["rest", false],
      ["reps", false],
    ]);
    expect(last().rows).toEqual(rows);
  });

  // Entrée n'a rien à ajouter ici : il n'y a pas de ligne dans le bandeau.
  it("n'écrit rien de plus sur Entrée qu'à la sortie du champ", async () => {
    const { user, getAllByRole, onBlock } = setup(block([load], rows));

    const cell = getAllByRole("textbox")[0] as HTMLElement;
    await user.clear(cell);
    await user.type(cell, "30{Enter}");

    expect(onBlock).toHaveBeenCalledOnce();
    expect(onBlock.mock.lastCall?.[0].rows).toHaveLength(2);
  });
});
