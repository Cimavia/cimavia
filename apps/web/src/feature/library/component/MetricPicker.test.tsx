import {
  BLOCK_MAX_METRICS,
  type BlockMetric,
  BlockType,
  type CustomMetric,
  type ExerciseBlock,
  MetricKey,
  MetricSource,
  MetricUnit,
} from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { describeReorder, dragOnto } from "../../../../test/reorder";
import { MetricPicker } from "./MetricPicker";

const { createMock, updateMock, deleteMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  createCustomMetric: createMock,
  updateCustomMetric: updateMock,
  deleteCustomMetric: deleteMock,
}));

const REPETITIONS = /exercise\.metric\.repetitions/;
const REMOVE_COLUMN = "library.builder.metrics.removeColumn";

const catalogMetric = (id: string, key: MetricKey): BlockMetric => ({
  id,
  source: MetricSource.CATALOG,
  key,
  unit: MetricUnit.NONE,
  label: null,
  collapsed: false,
});

const blockWith = (metrics: BlockMetric[], rows: ExerciseBlock["rows"] = []): ExerciseBlock => ({
  id: "block-1",
  label: null,
  structure: { type: BlockType.FREE },
  metrics,
  rows,
});

function setup(block: ExerciseBlock, customMetrics: readonly CustomMetric[] = []) {
  const onChange = vi.fn();
  const view = renderWithProviders(
    <MetricPicker
      open
      block={block}
      customMetrics={customMetrics}
      onChange={onChange}
      onClose={vi.fn()}
    />,
  );
  return { ...view, onChange };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MetricPicker", () => {
  it("ne rend rien tant que le panneau est fermé", () => {
    const onChange = vi.fn();
    const { queryByRole } = renderWithProviders(
      <MetricPicker
        open={false}
        block={blockWith([catalogMetric("m-1", MetricKey.LOAD)])}
        customMetrics={[]}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    expect(queryByRole("button", { name: REPETITIONS })).not.toBeInTheDocument();
  });

  describe("le choix des colonnes", () => {
    it("pose la métrique avec son unité par défaut", async () => {
      const { user, getByRole, onChange } = setup(
        blockWith([catalogMetric("m-1", MetricKey.LOAD)]),
      );

      await user.click(getByRole("button", { name: REPETITIONS }));

      // L'unité vient du catalogue et non d'un choix ultérieur : une colonne sans unité ne
      // saurait pas formater ses valeurs à l'affichage.
      const [next] = onChange.mock.calls[0] as [ExerciseBlock];
      expect(next.metrics.at(-1)).toMatchObject({
        source: MetricSource.CATALOG,
        key: MetricKey.REPETITIONS,
        // `MetricUnit.REPS` en dur, et non `defaultUnitOf(REPETITIONS)` : rappeler la fonction
        // que le composant appelle ne vérifierait que sa propre cohérence.
        unit: MetricUnit.REPS,
      });
    });

    it("retire la métrique quand on la reclique", async () => {
      const { user, getByRole, onChange } = setup(
        blockWith([
          catalogMetric("m-1", MetricKey.LOAD),
          catalogMetric("m-2", MetricKey.REPETITIONS),
        ]),
      );

      await user.click(getByRole("button", { name: REPETITIONS }));

      // La ligne du catalogue est une bascule, pas un bouton « ajouter » : recliquer ce qui est
      // déjà coché doit défaire, sinon la case cochée ne veut plus rien dire.
      const [next] = onChange.mock.calls[0] as [ExerciseBlock];
      expect(next.metrics.map((metric) => metric.id)).toEqual(["m-1"]);
    });

    it("ferme les métriques non retenues une fois le plafond atteint", () => {
      const keys = Object.values(MetricKey).slice(0, BLOCK_MAX_METRICS);
      const { getByRole } = setup(
        blockWith(keys.map((key, index) => catalogMetric(`m-${index}`, key))),
      );

      // Retenue : elle reste cliquable, sinon on ne pourrait plus rien retirer une fois au
      // plafond — c'est-à-dire précisément quand on en a besoin.
      expect(getByRole("button", { name: REPETITIONS })).toBeEnabled();
      expect(getByRole("button", { name: /exercise\.metric\.note/ })).toBeDisabled();
    });
  });

  describe("le retrait d'une colonne", () => {
    it("efface aussi les valeurs qu'elle portait dans les lignes", async () => {
      const { user, getAllByRole, onChange } = setup(
        blockWith(
          [catalogMetric("m-1", MetricKey.LOAD), catalogMetric("m-2", MetricKey.REPETITIONS)],
          [{ id: "row-1", values: { "m-1": 60, "m-2": 8 } }],
        ),
      );

      await user.click(getAllByRole("button", { name: REMOVE_COLUMN })[0] as HTMLElement);

      // Les laisser produirait des valeurs orphelines, que `validateBlockValues` signale à juste
      // titre comme une incohérence — le bloc deviendrait inenregistrable sans rien montrer.
      const [next] = onChange.mock.calls[0] as [ExerciseBlock];
      expect(next.rows[0]?.values).toEqual({ "m-2": 8 });
    });

    it("refuse de retirer la dernière colonne", () => {
      const { getAllByRole } = setup(blockWith([catalogMetric("m-1", MetricKey.LOAD)]));

      // `exerciseBlockSchema` exige au moins une colonne : un bloc vide n'aurait plus rien à
      // afficher, et le refus se dit ICI plutôt qu'à l'enregistrement.
      expect(getAllByRole("button", { name: REMOVE_COLUMN })[0]).toBeDisabled();
    });
  });

  describe("les métriques maison", () => {
    it("pose en colonne celle qui vient d'être créée", async () => {
      const created = {
        id: "cm-neuve",
        label: "Ressenti",
        unit: null,
        valueType: "NUMBER",
        scale: null,
      } as unknown as CustomMetric;
      createMock.mockResolvedValue(created);
      const { user, getByRole, onChange } = setup(
        blockWith([catalogMetric("m-1", MetricKey.LOAD)]),
      );

      await user.type(getByRole("textbox", { name: "library.builder.custom.label" }), "Ressenti");
      await user.click(getByRole("button", { name: "library.builder.custom.submit" }));

      // Créée ICI et posée aussitôt : sortir du constructeur pour définir une cotation puis y
      // revenir ferait perdre le fil de l'exercice en cours.
      await waitFor(() => expect(onChange).toHaveBeenCalled());
      const [next] = onChange.mock.calls[0] as [ExerciseBlock];
      expect(next.metrics.at(-1)).toMatchObject({
        source: MetricSource.CUSTOM,
        customMetricId: "cm-neuve",
      });
    });

    it("annonce l'absence de cotation maison", () => {
      const { getByText } = setup(blockWith([catalogMetric("m-1", MetricKey.LOAD)]));

      expect(getByText("library.builder.custom.none")).toBeInTheDocument();
    });
  });
});

const customMetric = (id: string, label: string, unit: string | null = null): CustomMetric =>
  ({ id, label, unit, valueType: "NUMBER", scale: null }) as unknown as CustomMetric;

const customColumn = (id: string, customMetricId: string): BlockMetric => ({
  id,
  source: MetricSource.CUSTOM,
  customMetricId,
  label: null,
  collapsed: false,
});

/** Le parent GARDE le bloc, comme `StructureSection` : chaque geste se relit à l'écran. */
function Harness({
  initial,
  customMetrics,
  onBlock,
}: Readonly<{
  initial: ExerciseBlock;
  customMetrics: readonly CustomMetric[];
  onBlock: (block: ExerciseBlock) => void;
}>) {
  const [block, setBlock] = useState(initial);
  return (
    <MetricPicker
      open
      block={block}
      customMetrics={customMetrics}
      onChange={(next) => {
        setBlock(next);
        onBlock(next);
      }}
      onClose={vi.fn()}
    />
  );
}

function mount(initial: ExerciseBlock, customMetrics: readonly CustomMetric[] = []) {
  const onBlock = vi.fn();
  const view = renderWithProviders(
    <Harness initial={initial} customMetrics={customMetrics} onBlock={onBlock} />,
  );
  const handle = (rank: number) =>
    view.getByRole("button", { name: `library.builder.metrics.moveColumn ${rank}` });
  // La ligne d'une colonne retenue ne porte QUE son libellé : poignée et corbeille sont des icônes.
  const order = () =>
    view
      .queryAllByRole("button", { name: /^library\.builder\.metrics\.moveColumn/ })
      .map((button) => button.parentElement?.textContent ?? null);
  const last = () => onBlock.mock.lastCall?.[0] as ExerciseBlock;
  return { ...view, onBlock, handle, order, last };
}

const threeColumns = () =>
  blockWith([
    catalogMetric("m-1", MetricKey.LOAD),
    catalogMetric("m-2", MetricKey.REPETITIONS),
    catalogMetric("m-3", MetricKey.NOTE),
  ]);

describe("MetricPicker — ordre des colonnes retenues", () => {
  describeReorder(
    ["exercise.metric.load", "exercise.metric.repetitions", "exercise.metric.note"],
    () => {
      const { user, handle, order, onBlock } = mount(threeColumns());
      const press = async (rank: number, key: string) => {
        handle(rank).focus();
        await user.keyboard(key);
      };
      return {
        order,
        moveUp: (rank) => press(rank, "{ArrowUp}"),
        moveDown: (rank) => press(rank, "{ArrowDown}"),
        drag: (from, to) => dragOnto(handle(from), handle(to)),
        writes: () => onBlock.mock.calls.length,
      };
    },
  );

  it("estompe la colonne saisie et éclaire la colonne survolée pendant le glisser", () => {
    const { handle } = mount(threeColumns());
    const row = (rank: number) => handle(rank).parentElement as HTMLElement;

    fireEvent.dragStart(handle(1));
    fireEvent.dragOver(handle(3));

    expect(row(1)).toHaveClass("opacity-40");
    expect(row(3)).toHaveClass("bg-cmv-accent-soft");
    expect(row(2)).toHaveClass("bg-cmv-surface");
  });
});

describe("MetricPicker — dernière colonne", () => {
  // Recliquer l'unique métrique retenue ne la retire pas : un bloc sans colonne ne porte rien.
  it("garde l'unique colonne quand on reclique sa métrique", async () => {
    const { user, getByRole, onBlock } = mount(blockWith([catalogMetric("m-1", MetricKey.LOAD)]));

    await user.click(getByRole("button", { name: /exercise\.metric\.load/, pressed: true }));

    expect(onBlock).not.toHaveBeenCalled();
  });
});

describe("MetricPicker — les métriques maison du coach", () => {
  const mine = [customMetric("cm-1", "Ressenti", "/10"), customMetric("cm-2", "Prises")];

  it("les liste avec leur unité, et sans annonce d'absence", () => {
    const { getByRole, queryByText } = mount(threeColumns(), mine);

    // Le nom accessible colle libellé et unité ; le texte de l'unité, lui, est bien rendu.
    expect(getByRole("button", { name: /^Ressenti/ })).toHaveTextContent("/10");
    expect(getByRole("button", { name: "Prises" })).toBeInTheDocument();
    expect(queryByText("library.builder.custom.none")).not.toBeInTheDocument();
  });

  it("pose une métrique maison en colonne au clic", async () => {
    const { user, getByRole, last } = mount(threeColumns(), mine);

    await user.click(getByRole("button", { name: "Prises" }));

    expect(last().metrics.at(-1)).toMatchObject({
      source: MetricSource.CUSTOM,
      customMetricId: "cm-2",
    });
  });

  // Une bascule, comme le catalogue : recliquer une métrique retenue la retire.
  it("retire une métrique maison retenue quand on la reclique", async () => {
    const block = blockWith([catalogMetric("m-1", MetricKey.LOAD), customColumn("c-1", "cm-1")]);
    const { user, getByRole, last, order } = mount(block, mine);

    expect(order()).toEqual(["exercise.metric.load", "Ressenti"]);
    await user.click(getByRole("button", { name: /^Ressenti/ }));

    expect(last().metrics.map((metric) => metric.id)).toEqual(["m-1"]);
  });

  it("ferme au plafond les métriques maison non retenues, pas celles retenues", () => {
    const keys = Object.values(MetricKey).slice(0, BLOCK_MAX_METRICS - 1);
    const block = blockWith([
      ...keys.map((key, index) => catalogMetric(`m-${index}`, key)),
      customColumn("c-1", "cm-1"),
    ]);
    const { getByRole } = mount(block, mine);

    expect(getByRole("button", { name: /^Ressenti/ })).toBeEnabled();
    expect(getByRole("button", { name: "Prises" })).toBeDisabled();
  });

  // La création pose la métrique d'office — sauf au plafond, où la poser rendrait le bloc invalide.
  it("crée la métrique sans la poser quand le bloc est au plafond", async () => {
    createMock.mockResolvedValue(customMetric("cm-neuve", "Fatigue"));
    const keys = Object.values(MetricKey).slice(0, BLOCK_MAX_METRICS);
    const { user, getByRole, onBlock } = mount(
      blockWith(keys.map((key, index) => catalogMetric(`m-${index}`, key))),
    );

    await user.type(getByRole("textbox", { name: "library.builder.custom.label" }), "Fatigue");
    await user.click(getByRole("button", { name: "library.builder.custom.submit" }));

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(getByRole("textbox", { name: "library.builder.custom.label" })).toHaveValue(""),
    );
    expect(onBlock).not.toHaveBeenCalled();
  });

  it("ouvre la métrique en modification, puis rend la main à l'annulation", async () => {
    const { user, getAllByRole, getByRole, getByText } = mount(threeColumns(), mine);

    await user.click(
      getAllByRole("button", { name: "library.builder.custom.edit" })[1] as HTMLElement,
    );

    expect(getByText("library.builder.custom.editTitle")).toBeInTheDocument();
    expect(getByRole("textbox", { name: "library.builder.custom.label" })).toHaveValue("Prises");

    await user.click(getByRole("button", { name: "library.builder.cancel" }));

    expect(getByText("library.builder.custom.title")).toBeInTheDocument();
    expect(getByRole("textbox", { name: "library.builder.custom.label" })).toHaveValue("");
  });

  it("rend la main une fois la modification enregistrée", async () => {
    updateMock.mockResolvedValue(customMetric("cm-1", "Ressenti global", "/10"));
    const { user, getAllByRole, getByRole, getByText } = mount(threeColumns(), mine);

    await user.click(
      getAllByRole("button", { name: "library.builder.custom.edit" })[0] as HTMLElement,
    );
    await user.type(getByRole("textbox", { name: "library.builder.custom.label" }), " global");
    await user.click(getByRole("button", { name: "library.builder.custom.update" }));

    await waitFor(() => expect(getByText("library.builder.custom.title")).toBeInTheDocument());
    expect(updateMock).toHaveBeenCalledWith(
      "cm-1",
      expect.objectContaining({ label: "Ressenti global" }),
    );
  });

  it("supprime la métrique maison désignée après confirmation", async () => {
    deleteMock.mockResolvedValue(undefined);
    const { user, getAllByRole, getByRole } = mount(threeColumns(), mine);

    await user.click(
      getAllByRole("button", { name: "library.builder.custom.remove" })[1] as HTMLElement,
    );
    expect(deleteMock).not.toHaveBeenCalled();
    await user.click(getByRole("button", { name: "common.confirmDelete" }));

    await waitFor(() => expect(deleteMock).toHaveBeenCalledExactlyOnceWith("cm-2"));
  });
});
