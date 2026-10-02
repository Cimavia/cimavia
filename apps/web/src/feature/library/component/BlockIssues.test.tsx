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
const EMPTY_SET = "library.builder.issue.emptySet";
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

    expect(messages()).toEqual([EMPTY_SET, EMPTY_SET]);
  });

  // #520 : en Séries la grille dit « Série 2 » ; l'avertissement la nomme pareil. Au-delà du
  // nombre de séries, la ligne n'est plus une série — elle reste « Ligne ».
  it("nomme série une série jouée, et ligne celle que personne ne jouera", () => {
    const { messages } = setup([
      { id: "r1", values: { reps: 5, load: 20 } },
      { id: "r2", values: {} },
      { id: "r3", values: { reps: 5, load: 20 } },
      { id: "r4", values: {} },
    ]);

    expect(messages()).toEqual([EMPTY_SET, EMPTY_ROW]);
  });

  it("nomme ligne la ligne vide d'un bloc qui n'est pas une Séries", () => {
    const view = renderWithProviders(
      <BlockIssues
        block={{ ...block([{ id: "r1", values: {} }]), structure: { type: BlockType.FREE } }}
        customMetrics={[]}
      />,
    );

    expect(view.getByRole("listitem")).toHaveTextContent(EMPTY_ROW);
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

    expect(messages()).toEqual([EMPTY_SET, BAD_VALUE]);
  });
});
