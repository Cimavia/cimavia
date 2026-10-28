import { MetricKey, MetricSource, MetricUnit } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { ComposedExerciseCard } from "./ComposedExerciseCard";

function setup(over: Partial<Parameters<typeof ComposedExerciseCard>[0]> = {}) {
  const change = {
    label: "plan.composition.change.ADD",
    sessionType: null,
    onReopen: vi.fn(),
    onRevert: vi.fn(),
  };
  const view = renderWithProviders(
    <ComposedExerciseCard
      code={null}
      title="Rameur"
      tags={[]}
      grid={null}
      customMetrics={[]}
      note="Allure régulière"
      removed={false}
      change={change}
      onReplace={null}
      onRemove={null}
      readOnly={false}
      isBusy={false}
      {...over}
    />,
  );
  return { ...view, change };
}

describe("ComposedExerciseCard", () => {
  it("dans un bloc à libellé : le nom sans code, la note, et aucune puce sans grille", () => {
    const view = setup();

    expect(view.getByText("Rameur")).toBeInTheDocument();
    expect(view.getByText("Allure régulière")).toBeInTheDocument();
    expect(view.queryByRole("list")).toBeNull();
    expect(view.container.textContent).not.toMatch(/^\d/);
  });

  it("préfixe les métriques de la grille, pour ne pas les confondre avec les tags", () => {
    const view = setup({
      tags: ["renfo"],
      grid: {
        metrics: [
          {
            id: "reps",
            label: null,
            source: MetricSource.CATALOG,
            key: MetricKey.REPETITIONS,
            unit: MetricUnit.REPS,
          },
        ],
        rows: [],
      },
    });

    const metrics = view.getByRole("list", { name: "plan.composition.metrics" });
    expect(metrics).toHaveTextContent("plan.composition.metrics");
    expect(metrics).not.toHaveTextContent("renfo");
  });

  it("rouvre le changement par son étiquette, un bouton comme les autres", async () => {
    const view = setup();

    await view.user.click(view.getByRole("button", { name: "plan.composition.change.ADD" }));

    expect(view.change.onReopen).toHaveBeenCalledOnce();
  });

  it("fige l'étiquette pendant un envoi", () => {
    const view = setup({ isBusy: true });

    expect(view.getByRole("button", { name: "plan.composition.change.ADD" })).toBeDisabled();
  });
});
