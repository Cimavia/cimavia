import { type BlockGrid, type GridMetric, MetricKey, MetricSource, MetricUnit } from "@cmv/shared";
import { within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { BlockExerciseGrid } from "./BlockExerciseGrid";

const reps: GridMetric = {
  id: "reps",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
};
const load: GridMetric = {
  id: "load",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.LOAD,
  unit: MetricUnit.KILOGRAMS,
};

const gridOf = (...rows: Record<string, number>[]): BlockGrid => ({
  metrics: [reps, load],
  rows: rows.map((values, index) => ({ id: `r${index + 1}`, values })),
});

/** La grille montée sur un VRAI état : chaque geste se relit à l'écran, et dans `last()`. */
function mount(initial: BlockGrid, limit: number) {
  const changes = vi.fn<(grid: BlockGrid) => void>();
  function Harness() {
    const [grid, setGrid] = useState(initial);
    return (
      <BlockExerciseGrid
        grid={grid}
        limit={limit}
        customMetrics={[]}
        pickable={[]}
        catalogOwner={null}
        onChange={(next) => {
          changes(next);
          setGrid(next);
        }}
      />
    );
  }
  const view = renderWithProviders(<Harness />);
  const last = () => changes.mock.lastCall?.[0] as BlockGrid;
  const cells = () => within(view.getByRole("table")).getAllByRole("textbox");
  return { ...view, changes, last, cells };
}

describe("BlockExerciseGrid", () => {
  it("montre une ligne par tour, les manquantes en fantômes de la dernière", () => {
    const view = mount(gridOf({ reps: 8, load: 60 }), 3);

    // 3 tours × 2 colonnes.
    expect(view.cells()).toHaveLength(6);
    expect(view.cells()[2]).toHaveValue("8");
    // Seule la ligne propre se déplace et se retire.
    expect(view.getAllByRole("button", { name: "library.builder.grid.removeRow" })).toHaveLength(1);
  });

  it("donne sa ligne au fantôme où l'on écrit, et à ceux d'avant lui", async () => {
    const view = mount(gridOf({ reps: 8, load: 60 }), 3);

    await view.user.clear(view.cells()[4] as HTMLElement);
    await view.user.type(view.cells()[4] as HTMLElement, "6");
    await view.user.tab();

    const rows = view.last().rows;
    expect(rows).toHaveLength(3);
    expect(rows[1]?.values).toEqual({ reps: 8, load: 60 });
    expect(rows[2]?.values.reps).toBe(6);
  });

  it("écrit dans sa ligne une valeur tapée sur une ligne propre", async () => {
    const view = mount(gridOf({ reps: 8, load: 60 }), 1);

    await view.user.clear(view.cells()[1] as HTMLElement);
    await view.user.type(view.cells()[1] as HTMLElement, "70");
    await view.user.tab();

    expect(view.last().rows).toEqual([{ id: "r1", values: { reps: 8, load: 70 } }]);
  });

  it("retire une ligne, que son fantôme remplace", async () => {
    const view = mount(gridOf({ reps: 8 }, { reps: 6 }), 2);

    await view.user.click(
      view.getAllByRole("button", { name: "library.builder.grid.removeRow" })[1] as HTMLElement,
    );

    expect(view.last().rows).toEqual([{ id: "r1", values: { reps: 8 } }]);
    expect(view.cells()).toHaveLength(4);
  });

  it("déplace une ligne propre au clavier, jamais au-delà des lignes propres", async () => {
    const view = mount(gridOf({ reps: 8 }, { reps: 6 }), 3);
    const handle = (rank: number) =>
      view.getByRole("button", { name: `library.builder.grid.moveRow ${rank}` });

    handle(2).focus();
    await view.user.keyboard("{ArrowDown}");
    expect(view.changes).not.toHaveBeenCalled();

    handle(2).focus();
    await view.user.keyboard("{ArrowUp}");
    expect(view.last().rows.map((row) => row.id)).toEqual(["r2", "r1"]);
  });

  it("dit les lignes au-delà des tours, toujours modifiables jusqu'à l'enregistrement", () => {
    const view = mount(gridOf({ reps: 8 }, { reps: 6 }, { reps: 4 }), 2);

    expect(view.getAllByText("library.session.blocks.beyond")).toHaveLength(1);
    expect(view.getAllByRole("button", { name: "library.builder.grid.removeRow" })).toHaveLength(3);
  });

  it("retire une colonne et ses valeurs depuis son menu", async () => {
    const view = mount(gridOf({ reps: 8, load: 60 }), 1);
    const [repsHeader] = view.getAllByRole("button", { expanded: false });

    await view.user.click(repsHeader as HTMLElement);
    await view.user.click(
      view.getByRole("button", { name: "library.session.blocks.removeColumn" }),
    );

    expect(view.last()).toEqual({
      metrics: [load],
      rows: [{ id: "r1", values: { load: 60 } }],
    });
  });

  it("remplit une colonne jusqu'au dernier tour depuis son menu", async () => {
    const view = mount(gridOf({ reps: 8, load: 60 }), 3);
    const [repsHeader] = view.getAllByRole("button", { expanded: false });

    await view.user.click(repsHeader as HTMLElement);
    await view.user.click(view.getByRole("button", { name: "library.builder.column.fillStep" }));

    expect(view.last().rows.map((row) => row.values.reps)).toEqual([8, 10, 12]);
    expect(view.queryByRole("button", { expanded: true })).toBeNull();
  });

  it("change l'unité d'une colonne du catalogue", async () => {
    const view = mount(gridOf({ reps: 8, load: 60 }), 1);
    const loadHeader = view.getAllByRole("button", { expanded: false })[1] as HTMLElement;

    await view.user.click(loadHeader);
    await view.user.selectOptions(
      view.getByRole("combobox", { name: "library.builder.column.unit" }),
      MetricUnit.KILOGRAMS_ADDED,
    );

    expect(view.last().metrics[1]).toEqual({ ...load, unit: MetricUnit.KILOGRAMS_ADDED });
  });

  it("dit qu'il n'y a rien à saisir sans colonne, et ouvre le choix des métriques", async () => {
    const view = mount({ metrics: [], rows: [] }, 3);

    expect(view.getByText("library.session.blocks.noMetric")).toBeInTheDocument();
    expect(view.queryByRole("table")).toBeNull();
    await view.user.click(view.getByRole("button", { name: "library.builder.metrics.edit" }));

    expect(view.getByText("library.builder.metrics.title")).toBeInTheDocument();
  });

  it("retire une colonne et ses valeurs depuis le choix des métriques", async () => {
    const view = mount(gridOf({ reps: 8, load: 60 }), 1);

    await view.user.click(view.getByRole("button", { name: "library.builder.metrics.edit" }));
    await view.user.click(
      view.getAllByRole("button", {
        name: "library.builder.metrics.removeColumn",
      })[0] as HTMLElement,
    );

    expect(view.last()).toEqual({ metrics: [load], rows: [{ id: "r1", values: { load: 60 } }] });
  });
});
