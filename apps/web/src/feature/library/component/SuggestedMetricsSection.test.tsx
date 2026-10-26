import {
  type CustomMetric,
  MetricKey,
  MetricSource,
  MetricUnit,
  type SuggestedMetric,
} from "@cmv/shared";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { SuggestedMetricsSection } from "./SuggestedMetricsSection";

const reps: SuggestedMetric = {
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
};
const ressenti: SuggestedMetric = { source: MetricSource.CUSTOM, customMetricId: "cm-1" };
const mine = [
  { id: "cm-1", label: "Ressenti", unit: null, valueType: "NUMBER", scale: null },
] as unknown as CustomMetric[];

/** Le parent GARDE la liste, comme le brouillon : chaque geste se relit à l'écran. */
function Harness({
  initial,
  onMetrics,
}: Readonly<{ initial: SuggestedMetric[]; onMetrics: (metrics: SuggestedMetric[]) => void }>) {
  const [metrics, setMetrics] = useState(initial);
  return (
    <SuggestedMetricsSection
      metrics={metrics}
      customMetrics={mine}
      pickable={mine}
      onChange={(next) => {
        setMetrics(next);
        onMetrics(next);
      }}
    />
  );
}

function setup(initial: SuggestedMetric[]) {
  const onMetrics = vi.fn();
  const view = renderWithProviders(<Harness initial={initial} onMetrics={onMetrics} />);
  // Le nom seul : le choix d'unité de la ligne a son propre test.
  const listed = () =>
    view.queryAllByRole("listitem").map((item) =>
      [...item.childNodes]
        .filter((node) => node.nodeName !== "LABEL")
        .map((node) => node.textContent)
        .join("")
        .replace(/^\d+/, ""),
    );
  return { ...view, onMetrics, listed };
}

describe("SuggestedMetricsSection", () => {
  it("liste les métriques dans leur ordre, maison comprise", () => {
    const { listed } = setup([ressenti, reps]);

    expect(listed()).toEqual(["Ressenti", "exercise.metric.repetitions"]);
  });

  // Aucune métrique suggérée est un état valide : l'exercice s'enregistre sans.
  it("annonce l'absence, sans liste", () => {
    const { getByText, listed } = setup([]);

    expect(getByText("library.builder.suggested.none")).toBeInTheDocument();
    expect(listed()).toEqual([]);
  });

  // Supprimée depuis (EX-2), elle se lit « — » : le coach doit savoir laquelle retirer.
  it("signale une métrique maison supprimée depuis, et elle seule", () => {
    const { getAllByText, listed } = setup([
      reps,
      ressenti,
      { source: MetricSource.CUSTOM, customMetricId: "cm-gone" },
    ]);

    expect(getAllByText("library.builder.suggested.orphan")).toHaveLength(1);
    expect(listed()).toEqual([
      "exercise.metric.repetitions",
      "Ressenti",
      "—library.builder.suggested.orphan",
    ]);
  });

  it("change l'unité suggérée d'une métrique du catalogue, et d'elle seule", async () => {
    const { getByRole, queryAllByRole, onMetrics, user } = setup([reps, ressenti]);

    // Une seule liste déroulante : une métrique maison porte son unité dans sa définition.
    expect(queryAllByRole("combobox")).toHaveLength(1);
    await user.selectOptions(
      getByRole("combobox", { name: "library.builder.suggested.unitOf" }),
      MetricUnit.REPS_PER_SIDE,
    );

    expect(onMetrics).toHaveBeenLastCalledWith([
      { ...reps, unit: MetricUnit.REPS_PER_SIDE },
      ressenti,
    ]);
  });

  it("n'offre aucun choix d'unité à une métrique qui n'en admet qu'une", () => {
    const { queryByRole } = setup([
      { source: MetricSource.CATALOG, key: MetricKey.ROUNDS, unit: MetricUnit.ROUNDS },
    ]);

    expect(queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("ajoute une métrique telle quelle, sans id de colonne ni libellé", async () => {
    const { user, getByRole, onMetrics, listed } = setup([reps]);

    await user.click(getByRole("button", { name: "library.builder.metrics.edit" }));
    await user.click(getByRole("button", { name: "Ressenti" }));

    expect(onMetrics).toHaveBeenLastCalledWith([reps, ressenti]);
    expect(listed()).toEqual(["exercise.metric.repetitions", "Ressenti"]);
  });

  it("retire la dernière métrique : un exercice peut n'en suggérer aucune", async () => {
    const { user, getByRole, onMetrics } = setup([reps]);

    await user.click(getByRole("button", { name: "library.builder.metrics.edit" }));
    await user.click(getByRole("button", { name: "library.builder.metrics.removeColumn" }));

    expect(onMetrics).toHaveBeenLastCalledWith([]);
  });

  it("referme le choix au bouton Valider", async () => {
    const { user, getByRole, queryByRole } = setup([reps]);

    await user.click(getByRole("button", { name: "library.builder.metrics.edit" }));
    await user.click(getByRole("button", { name: "library.builder.metrics.done" }));

    expect(queryByRole("complementary")).not.toBeInTheDocument();
  });
});
