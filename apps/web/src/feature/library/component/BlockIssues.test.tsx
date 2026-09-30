import {
  type BlockMetric,
  BlockType,
  type ExerciseBlock,
  MetricKey,
  MetricSource,
  MetricUnit,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { BlockIssues } from "./BlockIssues";

const EMPTY_ROW = "library.builder.issue.emptyRow";
const BAD_VALUE = "library.builder.issue.badValue";
const ORPHAN = "library.builder.issue.orphanValue";

const column = (id: string, key: MetricKey, unit: MetricUnit): BlockMetric => ({
  id,
  source: MetricSource.CATALOG,
  key,
  unit,
  label: null,
  collapsed: false,
});

const reps = column("reps", MetricKey.REPETITIONS, MetricUnit.REPS);
const load = column("load", MetricKey.LOAD, MetricUnit.KILOGRAMS);

const block = (rows: ExerciseBlock["rows"]): ExerciseBlock => ({
  id: "block-1",
  label: null,
  structure: { type: BlockType.SERIES, setCount: 3, restBetweenSetsSeconds: null },
  metrics: [reps, load],
  rows,
});

function setup(rows: ExerciseBlock["rows"]) {
  const view = renderWithProviders(<BlockIssues block={block(rows)} customMetrics={[]} />);
  const messages = () => view.queryAllByRole("listitem").map((item) => item.textContent);
  return { ...view, messages };
}

describe("BlockIssues", () => {
  it("ne dit rien sur un bloc sain", () => {
    const { queryByRole } = setup([{ id: "r1", values: { reps: 5, load: 20 } }]);

    expect(queryByRole("list")).not.toBeInTheDocument();
  });

  // Une grille sans ligne n'a rien de fautif : c'est un état valide, pas une erreur.
  it("ne dit rien sur une grille sans ligne", () => {
    const { queryByRole } = setup([]);

    expect(queryByRole("list")).not.toBeInTheDocument();
  });

  it("signale chaque ligne vide, une par une", () => {
    const { messages } = setup([
      { id: "r1", values: { reps: null, load: null } },
      { id: "r2", values: { reps: 5, load: null } },
      { id: "r3", values: {} },
    ]);

    expect(messages()).toEqual([EMPTY_ROW, EMPTY_ROW]);
  });

  // Trois erreurs dans la même colonne disent la même chose : UN message par colonne.
  it("signale une valeur invalide une seule fois par colonne", () => {
    const { messages } = setup([
      { id: "r1", values: { reps: "beaucoup", load: 20 } },
      { id: "r2", values: { reps: "trop", load: "lourd" } },
    ]);

    expect(messages()).toEqual([BAD_VALUE, BAD_VALUE]);
  });

  // Une valeur sous une colonne retirée : le bloc ne la montre plus, mais elle partirait au serveur.
  it("signale une valeur orpheline, sans colonne à nommer", () => {
    const { messages } = setup([{ id: "r1", values: { reps: 5, load: 20, gone: 3 } }]);

    expect(messages()).toEqual([ORPHAN]);
  });

  it("dit d'abord les lignes vides, puis les colonnes fautives", () => {
    const { messages } = setup([
      { id: "r1", values: { reps: "beaucoup", load: 20 } },
      { id: "r2", values: { reps: null, load: null } },
    ]);

    expect(messages()).toEqual([EMPTY_ROW, BAD_VALUE]);
  });
});
