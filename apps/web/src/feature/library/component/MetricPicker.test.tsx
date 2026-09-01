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
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { MetricPicker } from "./MetricPicker";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  createCustomMetric: createMock,
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
      const { user, getByRole, getByLabelText, onChange } = setup(
        blockWith([catalogMetric("m-1", MetricKey.LOAD)]),
      );

      await user.type(getByLabelText("library.builder.custom.label"), "Ressenti");
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
