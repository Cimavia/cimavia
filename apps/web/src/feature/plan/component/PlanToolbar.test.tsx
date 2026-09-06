import type { PlanRowFilter } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { PlanToolbar } from "@/feature/plan/component/PlanToolbar";
import { renderWithProviders } from "../../../../test/render";

const COUNTS: Record<PlanRowFilter, number> = { ALL: 6, ONGOING: 4, UPCOMING: 1, ENDED: 1 };

function setup(over: Partial<Parameters<typeof PlanToolbar>[0]> = {}) {
  const onSearchChange = vi.fn();
  const onFilterChange = vi.fn();
  const result = renderWithProviders(
    <PlanToolbar
      search=""
      filter="ALL"
      counts={COUNTS}
      onSearchChange={onSearchChange}
      onFilterChange={onFilterChange}
      {...over}
    />,
  );
  return { ...result, onSearchChange, onFilterChange };
}

/**
 * La barre d'outils de la liste des cycles. Les décomptes ne sont pas observables dans le texte
 * (`cimode` perd l'interpolation, cf. `test/i18n.ts`) : on affirme sur ce qui les gouverne — les
 * segments offerts et le filtre qu'ils demandent.
 */
describe("PlanToolbar", () => {
  it("offre les quatre segments, « Tous » compris", () => {
    const { getByText } = setup();

    for (const key of ["ALL", "ONGOING", "UPCOMING", "ENDED"]) {
      expect(getByText(`plan.stateFilter.${key}`)).toBeTruthy();
    }
  });

  it("demande le filtre choisi, et non celui qui était actif", async () => {
    const { getByText, user, onFilterChange } = setup();

    await user.click(getByText("plan.stateFilter.ENDED"));

    expect(onFilterChange).toHaveBeenCalledWith("ENDED");
  });

  it("remonte la recherche frappe par frappe — la vue se filtre en direct", async () => {
    const { getByLabelText, user, onSearchChange } = setup();

    await user.type(getByLabelText("plan.searchLabel"), "lé");

    expect(onSearchChange).toHaveBeenLastCalledWith("é");
  });

  it("affiche la recherche venue de l'url, pour qu'une vue en favori se relise", () => {
    const { getByLabelText } = setup({ search: "bonnet" });

    expect(getByLabelText("plan.searchLabel")).toHaveValue("bonnet");
  });
});
