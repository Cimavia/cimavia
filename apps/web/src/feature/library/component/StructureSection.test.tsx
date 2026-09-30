import {
  type BlockMetric,
  BlockType,
  DEFAULT_BLOCK_METRIC_KEYS,
  DEFAULT_BLOCK_STRUCTURE,
  EXERCISE_MAX_BLOCKS,
  type ExerciseBlock,
  type ExerciseBlocks,
  MetricKey,
  MetricSource,
  MetricUnit,
} from "@cmv/shared";
import { fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { describeReorder } from "../../../../test/reorder";
import { StructureSection } from "./StructureSection";

const ADD = "library.builder.addBlock";
const LABEL = "library.builder.blockLabel";
const UP = "library.builder.moveBlockUp";
const DOWN = "library.builder.moveBlockDown";

const reps: BlockMetric = {
  id: "reps",
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
  label: null,
  collapsed: false,
};

const block = (id: string, label: string | null): ExerciseBlock => ({
  id,
  label,
  structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: null },
  metrics: [{ ...reps, id: `${id}-reps` }],
  rows: [{ id: `${id}-r1`, values: { [`${id}-reps`]: 5 } }],
});

const threeBlocks = () => [block("b1", "A"), block("b2", "B"), block("b3", "C")];

/** Le parent GARDE les blocs, comme le constructeur : chaque écriture est relue au rendu suivant. */
function Harness({
  initial,
  onBlocks,
}: Readonly<{ initial: ExerciseBlocks; onBlocks: (blocks: ExerciseBlocks) => void }>) {
  const [blocks, setBlocks] = useState(initial);
  return (
    <StructureSection
      blocks={blocks}
      customMetrics={[]}
      onChange={(next) => {
        setBlocks(next);
        onBlocks(next);
      }}
    />
  );
}

function setup(initial: ExerciseBlocks = threeBlocks()) {
  const onBlocks = vi.fn();
  const view = renderWithProviders(<Harness initial={initial} onBlocks={onBlocks} />);
  const labels = () =>
    view
      .queryAllByRole("textbox", { name: LABEL })
      .map((input) => (input as HTMLInputElement).value);
  const written = () => onBlocks.mock.lastCall?.[0] as ExerciseBlocks;
  const nth = (name: string, rank: number) =>
    view.getAllByRole("button", { name })[rank - 1] as HTMLElement;
  return { ...view, onBlocks, labels, written, nth };
}

describe("StructureSection — ordre des blocs", () => {
  describeReorder(
    ["A", "B", "C"],
    () => {
      const { user, labels, nth, onBlocks } = setup();
      return {
        order: labels,
        moveUp: (rank) => user.click(nth(UP, rank)),
        moveDown: (rank) => user.click(nth(DOWN, rank)),
        writes: () => onBlocks.mock.calls.length,
      };
    },
    { withDrag: false },
  );

  // Les bornes tiennent au bouton fermé : le premier bloc n'a nulle part où monter.
  it("ferme la montée du premier bloc et la descente du dernier, et elles seules", () => {
    const { getAllByRole } = setup();
    const disabled = (name: string) =>
      getAllByRole("button", { name }).map((button) => (button as HTMLButtonElement).disabled);

    expect(disabled(UP)).toEqual([true, false, false]);
    expect(disabled(DOWN)).toEqual([false, false, true]);
  });

  it("numérote les blocs dans l'ordre affiché, après un déplacement", async () => {
    const { user, nth, getAllByRole } = setup();

    await user.click(nth(DOWN, 1));

    expect(
      getAllByRole("article").map(
        (card) =>
          within(card.querySelector("header") as HTMLElement).getByText(/^\d+$/).textContent,
      ),
    ).toEqual(["1", "2", "3"]);
  });
});

describe("StructureSection — ajout", () => {
  it("propose d'ajouter un premier bloc quand il n'y en a aucun", () => {
    const { getByText, getAllByRole } = setup([]);

    expect(getByText("library.builder.noBlockTitle")).toBeInTheDocument();
    expect(getByText("library.builder.noBlockDescription")).toBeInTheDocument();
    expect(getAllByRole("button", { name: ADD })).toHaveLength(1);
  });

  it.each(Object.values(BlockType))("crée un bloc %s neuf, sans ligne ni libellé", async (type) => {
    const { user, getByRole, queryByText, written } = setup([]);

    await user.click(getByRole("button", { name: ADD }));
    expect(queryByText("library.builder.noBlockTitle")).not.toBeInTheDocument();
    await user.click(getByRole("button", { name: new RegExp(`blockType\\.${type}library`) }));

    const [created] = written();
    expect(written()).toHaveLength(1);
    expect(created).toMatchObject({
      label: null,
      structure: DEFAULT_BLOCK_STRUCTURE[type],
      rows: [],
    });
    expect(created?.metrics.map((metric) => ("key" in metric ? metric.key : null))).toEqual(
      DEFAULT_BLOCK_METRIC_KEYS[type],
    );
    // Le choix fait, le sélecteur se referme et le bouton d'ajout revient sous le bloc.
    expect(queryByText("library.builder.blockTypeHint.SERIES")).not.toBeInTheDocument();
    expect(getByRole("button", { name: ADD })).toBeEnabled();
  });

  it("ajoute le bloc à la fin, sans toucher aux autres", async () => {
    const { user, getByRole, written } = setup();

    await user.click(getByRole("button", { name: ADD }));
    await user.click(getByRole("button", { name: /blockType\.FREElibrary/ }));

    expect(written().map((current) => current.label)).toEqual(["A", "B", "C", null]);
    expect(written().slice(0, 3)).toEqual(threeBlocks());
  });

  it("annuler referme le sélecteur sans rien écrire", async () => {
    const { user, getByRole, getByText, queryByText, onBlocks } = setup([]);

    await user.click(getByRole("button", { name: ADD }));
    await user.click(getByRole("button", { name: "library.builder.cancel" }));

    expect(queryByText("library.builder.blockTypeHint.SERIES")).not.toBeInTheDocument();
    expect(getByText("library.builder.noBlockTitle")).toBeInTheDocument();
    expect(onBlocks).not.toHaveBeenCalled();
  });

  // Par le texte et non par le rôle : sur vingt blocs et leurs grilles, `getByRole` parcourt tout
  // l'arbre d'accessibilité, et le test dépassait son délai sous la charge de turbo (#455).
  it.each([
    ["ferme l'ajout au plafond de blocs", EXERCISE_MAX_BLOCKS, false],
    ["le laisse ouvert un cran avant", EXERCISE_MAX_BLOCKS - 1, true],
  ])("%s", (_case, count, enabled) => {
    const blocks = Array.from({ length: count }, (_, index) => block(`b${index}`, null));

    const add = setup(blocks).getByText(ADD).closest("button");

    expect(add?.disabled).toBe(!enabled);
  });
});

describe("StructureSection — un bloc", () => {
  it("écrit le libellé sur SON bloc, et lui seul", async () => {
    const { user, getAllByRole, written } = setup();

    await user.type(getAllByRole("textbox", { name: LABEL })[1] as HTMLElement, "!");

    expect(written().map((current) => current.label)).toEqual(["A", "B!", "C"]);
  });

  // Le modèle porte l'absence, pas une chaîne vide — ni une chaîne d'espaces.
  it.each([
    ["vidé", ""],
    ["réduit à des espaces", "   "],
  ])("rend le libellé à null quand il est %s", (_case, typed) => {
    const { getAllByRole, written } = setup();

    fireEvent.change(getAllByRole("textbox", { name: LABEL })[0] as HTMLElement, {
      target: { value: typed },
    });

    expect(written()[0]?.label).toBeNull();
  });

  it("écrit la structure du bandeau sur SON bloc, et lui seul", () => {
    const { getAllByRole, written } = setup();

    fireEvent.change(
      getAllByRole("spinbutton", { name: "library.builder.bandeau.setCount" })[2] as HTMLElement,
      { target: { value: "6" } },
    );

    expect(
      written().map((current) =>
        "setCount" in current.structure ? current.structure.setCount : null,
      ),
    ).toEqual([3, 3, 6]);
  });

  it("retire le bloc désigné, et lui seul", async () => {
    const { user, nth, labels } = setup();

    await user.click(nth("library.builder.removeBlock", 2));

    expect(labels()).toEqual(["A", "C"]);
  });

  it("revient à l'état vide après le retrait du dernier bloc", async () => {
    const { user, getByRole, getByText } = setup([block("b1", "A")]);

    await user.click(getByRole("button", { name: "library.builder.removeBlock" }));

    expect(getByText("library.builder.noBlockTitle")).toBeInTheDocument();
  });

  it("ouvre le choix des colonnes de SON bloc, et le referme", async () => {
    const [first, second, third] = threeBlocks() as [ExerciseBlock, ExerciseBlock, ExerciseBlock];
    const withLoad: ExerciseBlock = {
      ...second,
      metrics: [
        ...second.metrics,
        { ...reps, id: "b2-load", key: MetricKey.LOAD, unit: MetricUnit.KILOGRAMS },
      ],
    };
    const { user, nth, getByRole, queryByRole } = setup([first, withLoad, third]);

    await user.click(nth("library.builder.metrics.edit", 2));
    const panel = getByRole("complementary", { name: "library.builder.metrics.title" });
    // Seul le bloc 2 porte deux colonnes : c'est bien le sien que le panneau montre.
    expect(within(panel).getAllByRole("button", { name: /metrics\.moveColumn/ })).toHaveLength(2);

    await user.click(getByRole("button", { name: "library.builder.metrics.done" }));
    expect(queryByRole("complementary")).not.toBeInTheDocument();
  });

  // Deux panneaux flottants se recouvrent : ouvrir un menu de colonne ferme celui d'un autre bloc.
  it("ne garde qu'un menu de colonne ouvert sur toute la page", async () => {
    const { user, getAllByRole } = setup();
    const headers = () => getAllByRole("button", { name: /exercise\.metric\.repetitions/ });

    await user.click(headers()[0] as HTMLElement);
    await user.click(headers()[2] as HTMLElement);

    expect(headers().map((header) => header.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false",
      "true",
    ]);
  });
});
