import {
  BLOCK_MAX_ROWS,
  type BlockMetric,
  BlockType,
  type ExerciseBlock,
  MetricKey,
  MetricSource,
  MetricUnit,
} from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { describeReorder, dragOnto } from "../../../../test/reorder";
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

function setup(rows: ExerciseBlock["rows"], metrics: BlockMetric[] = [reps, rest]) {
  const onRows = vi.fn();
  const view = renderWithProviders(
    <Harness initial={{ ...block(rows), metrics }} onRows={onRows} />,
  );
  const lastRows = () => onRows.mock.lastCall?.[0] as ExerciseBlock["rows"];
  const handle = (rank: number) =>
    view.getByRole("button", { name: `library.builder.grid.moveRow ${rank}` });
  return { ...view, onRows, lastRows, handle, cells: () => view.getAllByRole("textbox") };
}

/** Trois lignes à une seule colonne : chaque cellule EST sa ligne, et sa valeur la nomme. */
function setupThreeRows() {
  return setup(
    [1, 2, 3].map((value) => ({ id: `r${value}`, values: { reps: value } })),
    [reps],
  );
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

describe("BlockGrid — les lignes", () => {
  describeReorder(["1", "2", "3"], () => {
    const { user, cells, handle, onRows } = setupThreeRows();
    const press = async (rank: number, key: string) => {
      handle(rank).focus();
      await user.keyboard(key);
    };
    return {
      order: () => cells().map((cell) => (cell as HTMLInputElement).value),
      moveUp: (rank) => press(rank, "{ArrowUp}"),
      moveDown: (rank) => press(rank, "{ArrowDown}"),
      drag: (from, to) => dragOnto(handle(from), handle(to)),
      writes: () => onRows.mock.calls.length,
    };
  });

  // Deux séries se ressemblent presque toujours : la ligne ajoutée part des valeurs de la dernière.
  it("ajoute une ligne qui recopie la dernière, sous un id neuf", async () => {
    const { user, getByRole, lastRows } = setupThreeRows();

    await user.click(getByRole("button", { name: "library.builder.grid.addRow" }));

    const rows = lastRows();
    expect(rows.map((row) => row.values.reps)).toEqual([1, 2, 3, 3]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(4);
  });

  it("ferme l'ajout quand la grille atteint le maximum de lignes", () => {
    const full = Array.from({ length: BLOCK_MAX_ROWS }, (_, index) => ({
      id: `r${index}`,
      values: { reps: 1 },
    }));
    const { getByText } = setup(full, [reps]);

    // Par le texte et non par le rôle : sur 200 lignes, calculer le nom accessible de chaque
    // élément coûte plus d'une seconde, et le test tombait sous le délai en couverture (#455).
    expect(getByText("library.builder.grid.addRow").closest("button")).toBeDisabled();
  });

  it("laisse l'ajout ouvert sous le maximum", () => {
    const { getByRole } = setupThreeRows();

    expect(getByRole("button", { name: "library.builder.grid.addRow" })).toBeEnabled();
  });

  it("retire la ligne désignée, et elle seule", async () => {
    const { user, getAllByRole, lastRows } = setupThreeRows();

    await user.click(
      getAllByRole("button", { name: "library.builder.grid.removeRow" })[1] as HTMLElement,
    );

    expect(lastRows().map((row) => row.id)).toEqual(["r1", "r3"]);
  });

  // Le repère du glisser : où l'élément saisi part, et où il atterrira.
  it("estompe la ligne saisie et éclaire la ligne survolée pendant le glisser", () => {
    const { handle } = setupThreeRows();
    const row = (rank: number) => handle(rank).closest("tr") as HTMLElement;

    fireEvent.dragStart(handle(1));
    fireEvent.dragOver(handle(3));

    expect(row(1)).toHaveClass("opacity-40");
    expect(row(3)).toHaveClass("bg-cmv-accent-soft");
    expect(row(2)).not.toHaveClass("opacity-40");
    expect(row(2)).not.toHaveClass("bg-cmv-accent-soft");

    fireEvent.dragEnd(handle(1));

    expect(row(1)).not.toHaveClass("opacity-40");
    expect(row(3)).not.toHaveClass("bg-cmv-accent-soft");
  });
});
