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

/**
 * Un bloc LIBRE : ses lignes sont des étapes, qu'on ajoute, valide et déplace librement. La Séries,
 * dont la grille suit le nombre de séries (#520), a ses propres tests plus bas.
 */
const block = (rows: ExerciseBlock["rows"]): ExerciseBlock => ({
  id: "block-1",
  label: null,
  structure: { type: BlockType.FREE },
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

// ── Séries : une ligne par série (#520) ──────────────────────────────────────────────────────

const GHOST_OF = "library.builder.grid.ghostOf";
const UNPLAYED = "library.builder.grid.unplayed";

const seriesOf = (rows: ExerciseBlock["rows"], setCount: number): ExerciseBlock => ({
  ...block(rows),
  structure: { type: BlockType.SERIES, setCount, restBetweenSetsSeconds: null },
});

function setupSeries(rows: ExerciseBlock["rows"], setCount: number) {
  const onRows = vi.fn();
  const view = renderWithProviders(<Harness initial={seriesOf(rows, setCount)} onRows={onRows} />);
  const lastRows = () => onRows.mock.lastCall?.[0] as ExerciseBlock["rows"];
  const cells = () => view.getAllByRole("textbox") as HTMLInputElement[];
  return { ...view, onRows, lastRows, cells };
}

/** Le cas du retour coach : 10 × 1 kg puis 10 × 2 kg, quatre séries. */
const twoOfFour = () =>
  setupSeries(
    [
      { id: "r1", values: { reps: 10, rest: 60 } },
      { id: "r2", values: { reps: 12, rest: 90 } },
    ],
    4,
  );

describe("BlockGrid — Séries", () => {
  it("intitule la colonne d'index « Série », en clair", () => {
    const { getByRole } = twoOfFour();

    expect(getByRole("columnheader", { name: "library.builder.grid.setIndex" })).toBeVisible();
  });

  it("montre autant de lignes que de séries, les dernières reprenant la dernière ligne", () => {
    const { cells, getAllByText } = twoOfFour();

    expect(cells().map((cell) => cell.value)).toEqual([
      "10",
      "1'",
      "12",
      "1'30",
      "12",
      "1'30",
      "12",
      "1'30",
    ]);
    // « reprend la série 2 », sur les séries 3 et 4.
    expect(getAllByText(GHOST_OF)).toHaveLength(2);
  });

  // Rien à reprendre sur une grille vide : la cellule dit « — », aucune valeur inventée (règle n°5).
  it("montre des séries vides et saisissables sur une grille sans ligne", () => {
    const { cells, queryByText } = setupSeries([], 3);

    expect(cells()).toHaveLength(6);
    expect(cells().every((cell) => cell.value === "")).toBe(true);
    expect(cells()[0]).toHaveAttribute("placeholder", "library.builder.grid.emptyValue");
    expect(queryByText(GHOST_OF)).not.toBeInTheDocument();
  });

  it("donne sa ligne à une série fantôme — et aux fantômes qui la précèdent", async () => {
    const { user, cells, lastRows } = twoOfFour();

    const series4 = cells()[6] as HTMLElement;
    await user.clear(series4);
    await user.type(series4, "8");
    await user.tab();

    expect(lastRows().map((row) => row.values)).toEqual([
      { reps: 10, rest: 60 },
      { reps: 12, rest: 90 },
      { reps: 12, rest: 90 },
      { reps: 8, rest: 90 },
    ]);
  });

  // Le coach tabule hors de la cellule qu'il vient de remplir : la ligne se matérialise sous lui,
  // et le focus doit rester dans la ligne plutôt que de retomber sur la page.
  it("garde le focus dans la série qui vient de recevoir sa ligne", async () => {
    const { user, cells } = twoOfFour();

    const series3 = cells()[4] as HTMLElement;
    await user.clear(series3);
    await user.type(series3, "8");
    await user.tab();

    expect(document.activeElement).toBe(cells()[5]);
  });

  it("ne crée pas de ligne sur Entrée, même sur la dernière série", async () => {
    const { user, cells, lastRows } = setupSeries([{ id: "r1", values: { reps: 5 } }], 1);

    await user.type(cells()[1] as HTMLElement, "2:30{Enter}");

    expect(lastRows().map((row) => row.values)).toEqual([{ reps: 5, rest: 150 }]);
  });

  // Entrée dans un fantôme valide la saisie — qui lui donne sa ligne — sans en créer d'autre.
  it("ne crée que la série visée sur Entrée dans un fantôme", async () => {
    const { user, cells, lastRows } = setupSeries([{ id: "r1", values: { reps: 5 } }], 2);

    const series2 = cells()[2] as HTMLElement;
    await user.clear(series2);
    await user.type(series2, "6{Enter}");

    expect(lastRows().map((row) => row.values.reps)).toEqual([5, 6]);
  });

  it("n'offre pas d'ajouter une ligne : le nombre de séries la fixe", () => {
    const { queryByRole, getByText } = twoOfFour();

    expect(queryByRole("button", { name: "library.builder.grid.addRow" })).not.toBeInTheDocument();
    expect(getByText("library.builder.grid.keyboardHintSeries")).toBeInTheDocument();
  });

  // Les lignes sont un tableau : la suivante remonte, et la dernière série redevient fantôme.
  it("rend fantôme la dernière série quand on retire une série détaillée", async () => {
    const { user, getAllByRole, getAllByText, lastRows } = twoOfFour();

    await user.click(
      getAllByRole("button", { name: "library.builder.grid.removeRow" })[0] as HTMLElement,
    );

    expect(lastRows().map((row) => row.id)).toEqual(["r2"]);
    expect(getAllByText(GHOST_OF)).toHaveLength(3);
  });

  it("marque non jouées les lignes au-delà du nombre de séries, et les laisse retirer", async () => {
    const { user, getAllByText, getAllByRole, lastRows } = setupSeries(
      [1, 2, 3].map((value) => ({ id: `r${value}`, values: { reps: value } })),
      1,
    );

    expect(getAllByText(UNPLAYED)).toHaveLength(2);

    await user.click(
      getAllByRole("button", { name: "library.builder.grid.removeRow" })[2] as HTMLElement,
    );

    expect(lastRows().map((row) => row.id)).toEqual(["r1", "r2"]);
  });

  it("suit le nombre de séries : fantômes en plus, lignes non jouées en moins", () => {
    const four = [1, 2, 3, 4].map((value) => ({ id: `r${value}`, values: { reps: value } }));
    const grid = (setCount: number) => (
      <BlockGrid
        block={seriesOf(four, setCount)}
        customMetrics={[]}
        openMetricId={null}
        onOpenChange={() => undefined}
        onChange={() => undefined}
      />
    );
    const { rerender, queryAllByText } = renderWithProviders(grid(4));
    expect(queryAllByText(GHOST_OF)).toHaveLength(0);

    rerender(grid(6));
    expect(queryAllByText(GHOST_OF)).toHaveLength(2);

    rerender(grid(2));
    expect(queryAllByText(UNPLAYED)).toHaveLength(2);
  });
});
