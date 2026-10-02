import {
  AdjustmentLevel,
  BLOCK_MAX_ROWS,
  BlockType,
  cellPath,
  type ExerciseBlocks,
  MetricKey,
  MetricSource,
  MetricUnit,
  type SessionDto,
} from "@cmv/shared";
import { fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { describeReorder, dragOnto } from "../../../../test/reorder";
import { useSessionDraft } from "../hook/useSessionDraft";
import { SessionBlockGrid } from "./SessionBlockGrid";

const REVERT = "library.session.revert";

const blocks: ExerciseBlocks = [
  {
    id: "block-1",
    label: null,
    // LIBRE : ses lignes s'ajoutent et se déplacent librement. La Séries a ses tests plus bas.
    structure: { type: BlockType.FREE },
    metrics: [
      {
        id: "reps",
        source: MetricSource.CATALOG,
        key: MetricKey.REPETITIONS,
        unit: MetricUnit.REPS,
        label: null,
        collapsed: false,
      },
      {
        id: "rest",
        source: MetricSource.CATALOG,
        key: MetricKey.REST_BETWEEN_SETS,
        unit: MetricUnit.NONE,
        label: null,
        collapsed: false,
      },
    ],
    rows: [{ id: "r1", values: { reps: 5, rest: null } }],
  },
];

const session = {
  id: "session-1",
  title: "Force",
  notes: null,
  exercises: [
    {
      id: "sx-1",
      exerciseId: "ex-1",
      title: "Traction lestée",
      tags: [],
      note: null,
      blocks,
      baseline: blocks,
      adjustments: [],
    },
  ],
} as unknown as SessionDto;

/**
 * Le VRAI brouillon de séance, et non un parent simulé : #299 naissait de la rencontre entre
 * l'écriture de la cellule, qui pose son marqueur, et l'ajout de ligne, qui remonte les lignes en
 * entier. Seul le brouillon réel les fait se croiser comme à l'écran.
 */
function Harness({ initial = session }: Readonly<{ initial?: SessionDto }>) {
  const draft = useSessionDraft(initial);
  const item = draft.items[0];
  const block = item?.blocks[0];
  if (item == null || block == null) return null;

  return (
    <SessionBlockGrid
      block={block}
      baseline={item.baseline}
      adjustments={item.adjustments}
      customMetrics={[]}
      onCellChange={(rowId, metricId, value) =>
        draft.setCellValue(item.key, block.id, rowId, metricId, value)
      }
      onRowsChange={(rows) => draft.setRows(item.key, block.id, rows)}
      onRevertCell={(rowId, metricId) => draft.revertCell(item.key, block.id, rowId, metricId)}
    />
  );
}

describe("SessionBlockGrid — Entrée sur la dernière ligne", () => {
  it("garde la durée tapée, la recopie dans la ligne créée, et marque la seule cellule ajustée", async () => {
    const { user, getAllByRole } = renderWithProviders(<Harness />);

    await user.type(getAllByRole("textbox")[1] as HTMLElement, "2:30{Enter}");

    const cells = getAllByRole("textbox");
    expect(cells).toHaveLength(4);
    expect(cells[1]).toHaveValue("2'30");
    expect(cells[3]).toHaveValue("2'30");
    // La ligne créée n'existe pas dans la référence : elle ne s'écarte d'aucun défaut, donc un
    // seul marqueur — celui de la cellule tapée.
    expect(getAllByRole("button", { name: REVERT })).toHaveLength(1);
  });
});

/** La même séance, réduite à une colonne de répétitions sur les lignes données. */
function sessionWithRows(values: number[]): SessionDto {
  const [first] = blocks;
  const repsOnly = [
    {
      ...(first as ExerciseBlocks[number]),
      metrics: [(first as ExerciseBlocks[number]).metrics[0]],
      rows: values.map((value, index) => ({ id: `r${index + 1}`, values: { reps: value } })),
    },
  ] as ExerciseBlocks;
  const [exercise] = session.exercises;
  return {
    ...session,
    exercises: [{ ...exercise, blocks: repsOnly, baseline: repsOnly, adjustments: [] }],
  } as SessionDto;
}

function mountRows(values: number[] = [1, 2, 3]) {
  const view = renderWithProviders(<Harness initial={sessionWithRows(values)} />);
  const handle = (rank: number) =>
    view.getByRole("button", { name: `library.builder.grid.moveRow ${rank}` });
  const readValues = () =>
    view.getAllByRole("textbox").map((cell) => (cell as HTMLInputElement).value);
  return { ...view, handle, values: readValues };
}

describe("SessionBlockGrid — les lignes", () => {
  describeReorder(["1", "2", "3"], () => {
    const { user, handle, values } = mountRows();
    const press = async (rank: number, key: string) => {
      handle(rank).focus();
      await user.keyboard(key);
    };
    return {
      order: values,
      moveUp: (rank) => press(rank, "{ArrowUp}"),
      moveDown: (rank) => press(rank, "{ArrowDown}"),
      drag: (from, to) => dragOnto(handle(from), handle(to)),
    };
  });

  it("ajoute une ligne qui recopie la dernière", async () => {
    const { user, getByRole, values } = mountRows();

    await user.click(getByRole("button", { name: "library.builder.grid.addRow" }));

    expect(values()).toEqual(["1", "2", "3", "3"]);
  });

  it("ferme l'ajout quand la grille atteint le maximum de lignes", () => {
    const { getByText } = mountRows(Array.from({ length: BLOCK_MAX_ROWS }, () => 1));

    // Par le texte et non par le rôle : sur 200 lignes, calculer le nom accessible de chaque
    // élément coûte plus d'une seconde, et le test tombait sous le délai en couverture (#455).
    expect(getByText("library.builder.grid.addRow").closest("button")).toBeDisabled();
  });

  it("retire la ligne désignée, et elle seule", async () => {
    const { user, getAllByRole, values } = mountRows();

    await user.click(
      getAllByRole("button", { name: "library.builder.grid.removeRow" })[0] as HTMLElement,
    );

    expect(values()).toEqual(["2", "3"]);
  });

  // Entrée ailleurs que sur la dernière ligne valide, sans insérer de ligne au milieu.
  it("valide sans ajouter de ligne quand la cellule n'est pas sur la dernière", async () => {
    const { user, getAllByRole, values } = mountRows();

    const cell = getAllByRole("textbox")[0] as HTMLElement;
    await user.clear(cell);
    await user.type(cell, "8{Enter}");

    expect(values()).toEqual(["8", "2", "3"]);
  });

  it("estompe la ligne saisie et éclaire la ligne survolée pendant le glisser", () => {
    const { handle } = mountRows();
    const row = (rank: number) => handle(rank).closest("tr") as HTMLElement;

    fireEvent.dragStart(handle(3));
    fireEvent.dragOver(handle(1));

    expect(row(3)).toHaveClass("opacity-40");
    expect(row(1)).toHaveClass("bg-cmv-accent-soft");
    expect(row(2)).not.toHaveClass("opacity-40");
    expect(row(2)).not.toHaveClass("bg-cmv-accent-soft");
  });
});

describe("SessionBlockGrid — colonnes verrouillées", () => {
  // Au niveau séance, le coach ajuste des VALEURS, pas la forme : l'en-tête n'offre aucun menu.
  it("rend l'en-tête de colonne en libellé, sans aucun bouton", () => {
    const { getAllByRole } = mountRows();

    const [header] = getAllByRole("rowgroup");
    expect(within(header as HTMLElement).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("SessionBlockGrid — marqueur d'ajustement", () => {
  it("revient au défaut : la valeur d'origine revient, le marqueur disparaît", async () => {
    const { user, getAllByRole, getByRole, queryByRole } = renderWithProviders(<Harness />);

    const cell = getAllByRole("textbox")[0] as HTMLElement;
    await user.clear(cell);
    await user.type(cell, "8");
    await user.tab();
    expect(getAllByRole("textbox")[0]).toHaveValue("8");

    await user.click(getByRole("button", { name: REVERT }));

    expect(getAllByRole("textbox")[0]).toHaveValue("5");
    expect(queryByRole("button", { name: REVERT })).not.toBeInTheDocument();
  });

  /**
   * La FORME distingue les niveaux, pas seulement la couleur : rond pour la séance, carré pour la
   * planification. Les deux coexistent sur une grille, et une couleur seule serait illisible pour
   * un daltonien.
   */
  it.each([
    [AdjustmentLevel.SESSION, "rounded-cmv-pill"],
    [AdjustmentLevel.SCHEDULED, "rounded-cmv-sm"],
  ])("donne au niveau %s sa propre forme", (level, shape) => {
    const [block] = blocks;
    const { getByRole } = renderWithProviders(
      <SessionBlockGrid
        block={block as ExerciseBlocks[number]}
        baseline={blocks}
        adjustments={[{ path: cellPath("block-1", "r1", "reps"), level }]}
        customMetrics={[]}
        onCellChange={vi.fn()}
        onRowsChange={vi.fn()}
        onRevertCell={vi.fn()}
      />,
    );

    const marker = getByRole("button", { name: REVERT }).parentElement?.querySelector(
      "[aria-hidden='true']",
    );
    expect(marker).toHaveClass(shape);
  });
});

// ── Séries : une ligne par série (#520) ──────────────────────────────────────────────────────

/** La séance, avec un bloc SÉRIES de `setCount` séries sur les lignes de répétitions données. */
function seriesSession(values: number[], setCount: number): SessionDto {
  const base = sessionWithRows(values);
  const [exercise] = base.exercises;
  const [block] = exercise?.blocks ?? [];
  const series = [
    {
      ...(block as ExerciseBlocks[number]),
      structure: { type: BlockType.SERIES, setCount, restBetweenSetsSeconds: null },
    },
  ] as ExerciseBlocks;
  return {
    ...base,
    exercises: [{ ...exercise, blocks: series, baseline: series }],
  } as SessionDto;
}

describe("SessionBlockGrid — Séries", () => {
  // Une série matérialisée dans la séance est une ligne AJOUTÉE : absente de la référence, elle
  // ne s'écarte d'aucun défaut, donc aucun marqueur — comme toute ligne ajoutée (`resetRow`).
  it("donne sa ligne à une série fantôme, sans poser de marqueur", async () => {
    const { user, getAllByRole, queryByRole, queryAllByText } = renderWithProviders(
      <Harness initial={seriesSession([5], 2)} />,
    );

    const series2 = getAllByRole("textbox")[1] as HTMLElement;
    await user.clear(series2);
    await user.type(series2, "8");
    await user.tab();

    expect(getAllByRole("textbox").map((cell) => (cell as HTMLInputElement).value)).toEqual([
      "5",
      "8",
    ]);
    expect(queryAllByText("library.builder.grid.ghostOf")).toHaveLength(0);
    expect(queryByRole("button", { name: REVERT })).not.toBeInTheDocument();
  });

  // Pas de « Revenir au défaut » sur une ligne ajoutée : c'est la corbeille qui la rend fantôme.
  it("rend fantôme une série matérialisée qu'on retire", async () => {
    const { user, getAllByRole, getAllByText } = renderWithProviders(
      <Harness initial={seriesSession([5], 2)} />,
    );

    const series2 = getAllByRole("textbox")[1] as HTMLElement;
    await user.clear(series2);
    await user.type(series2, "8");
    await user.tab();
    await user.click(
      getAllByRole("button", { name: "library.builder.grid.removeRow" })[1] as HTMLElement,
    );

    expect(getAllByText("library.builder.grid.ghostOf")).toHaveLength(1);
    expect(getAllByRole("textbox")[1]).toHaveValue("5");
  });

  it("n'offre pas d'ajouter une ligne", () => {
    const { queryByRole } = renderWithProviders(<Harness initial={seriesSession([5], 2)} />);

    expect(queryByRole("button", { name: "library.builder.grid.addRow" })).not.toBeInTheDocument();
  });
});
