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
import { BlockGrid } from "./BlockGrid";

const column = (id: string, key: MetricKey, unit: MetricUnit): BlockMetric => ({
  id,
  source: MetricSource.CATALOG,
  key,
  unit,
  label: null,
  collapsed: false,
});

const reps = column("reps", MetricKey.REPETITIONS, MetricUnit.REPS);
const rest = column("rest", MetricKey.REST_BETWEEN_SETS, MetricUnit.NONE);

const block = (rows: ExerciseBlock["rows"]): ExerciseBlock => ({
  id: "block-1",
  label: null,
  structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null },
  metrics: [reps, rest],
  rows,
});

/**
 * Le parent GARDE le bloc, comme `StructureSection` : c'est ce qui rend #299 observable. Avec un
 * `onChange` espion seul, les deux écritures d'Entrée — la valeur, puis la ligne — ne se
 * rencontreraient jamais.
 */
function Harness({
  initial,
  onRows,
}: Readonly<{ initial: ExerciseBlock; onRows: (rows: ExerciseBlock["rows"]) => void }>) {
  const [current, setCurrent] = useState(initial);
  return (
    <BlockGrid
      block={current}
      customMetrics={[]}
      openMetricId={null}
      onOpenChange={() => undefined}
      onChange={(next) => {
        setCurrent(next);
        onRows(next.rows);
      }}
    />
  );
}

function setup(rows: ExerciseBlock["rows"]) {
  const onRows = vi.fn();
  const view = renderWithProviders(<Harness initial={block(rows)} onRows={onRows} />);
  const lastRows = () => onRows.mock.lastCall?.[0] as ExerciseBlock["rows"];
  return { ...view, lastRows, cells: () => view.getAllByRole("textbox") };
}

describe("BlockGrid — Entrée sur la dernière ligne", () => {
  /** Le cas de #299 : la ligne était créée, le repos tapé avait disparu. */
  it("garde la durée tapée ET la recopie dans la ligne créée", async () => {
    const { user, cells, lastRows } = setup([{ id: "r1", values: { reps: 5 } }]);

    await user.type(cells()[1] as HTMLElement, "2:30{Enter}");

    expect(lastRows().map((row) => row.values)).toEqual([
      { reps: 5, rest: 150 },
      { reps: 5, rest: 150 },
    ]);
  });

  it("garde un nombre décimal tapé", async () => {
    const { user, cells, lastRows } = setup([{ id: "r1", values: { reps: null } }]);

    await user.type(cells()[0] as HTMLElement, "7,5{Enter}");

    expect(lastRows().map((row) => row.values.reps)).toEqual([7.5, 7.5]);
  });

  it("ne crée pas de ligne sur une saisie refusée", async () => {
    const { user, cells } = setup([{ id: "r1", values: { reps: 5 } }]);

    await user.type(cells()[1] as HTMLElement, "demain{Enter}");

    expect(cells()).toHaveLength(2);
  });

  it("valide sans ajouter de ligne quand la cellule n'est pas sur la dernière", async () => {
    const { user, cells, lastRows } = setup([
      { id: "r1", values: { reps: 5 } },
      { id: "r2", values: { reps: 5 } },
    ]);

    await user.type(cells()[1] as HTMLElement, "2:30{Enter}");

    expect(lastRows().map((row) => row.values.rest ?? null)).toEqual([150, null]);
  });
});
