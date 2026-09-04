import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanBuilderActions } from "@/feature/plan/component/PlanBuilderActions";
import { useDeletePlan, usePublishPlan } from "@/feature/plan/hook/usePlans";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/plan/hook/usePlans", () => ({
  useDeletePlan: vi.fn(),
  usePublishPlan: vi.fn(),
}));

const publish = vi.fn();
const remove = vi.fn();
vi.mocked(useDeletePlan).mockReturnValue({
  mutate: remove,
  isPending: false,
} as unknown as ReturnType<typeof useDeletePlan>);
vi.mocked(usePublishPlan).mockReturnValue({
  mutate: publish,
  isPending: false,
} as unknown as ReturnType<typeof usePublishPlan>);

beforeEach(() => {
  vi.clearAllMocks();
});

// Un brouillon à qui plus rien ne manque : chaque test n'en dégrade qu'un aspect à la fois.
const READY: ComponentProps<typeof PlanBuilderActions> = {
  planId: "pln_1",
  isPublished: false,
  hasWeeks: true,
  hasAthlete: true,
  isBillingFilled: true,
  requiresBilling: true,
  isBusy: false,
};

const mount = (props: Partial<typeof READY>) =>
  renderInRoute(<PlanBuilderActions {...READY} {...props} />, {
    path: "/plans/$planId",
    params: { planId: "pln_1" },
    links: ["/plans"],
  });

/**
 * Le gating de la diffusion, et surtout ce qu'il DIT. Un bouton grisé sans explication oblige le
 * coach à deviner ce qui manque — ici l'info-bulle nomme le manque, dans l'ordre des verrous de
 * l'API (#144) : le destinataire avant la facturation.
 */
describe("PlanBuilderActions — diffuser", () => {
  it("laisse diffuser un brouillon complet", async () => {
    const { getByText } = await mount({});

    expect((getByText("plan.builder.publish") as HTMLButtonElement).disabled).toBe(false);
  });

  it("ferme la diffusion tant que le cycle n'a pas de destinataire", async () => {
    const { getByText, getByTitle } = await mount({ hasAthlete: false });

    expect((getByText("plan.builder.publish") as HTMLButtonElement).disabled).toBe(true);
    expect(getByTitle("plan.builder.athleteRequired")).toBeTruthy();
  });

  it("nomme le destinataire manquant plutôt que la facturation quand les deux manquent", async () => {
    const { getByTitle, queryByTitle } = await mount({
      hasAthlete: false,
      isBillingFilled: false,
    });

    expect(getByTitle("plan.builder.athleteRequired")).toBeTruthy();
    expect(queryByTitle("plan.builder.billingRequired")).toBeNull();
  });

  it("nomme la facturation une fois le destinataire choisi", async () => {
    const { getByTitle } = await mount({ isBillingFilled: false });

    expect(getByTitle("plan.builder.billingRequired")).toBeTruthy();
  });

  it("diffuse le cycle quand plus rien ne manque", async () => {
    const { getByText, user } = await mount({});

    await user.click(getByText("plan.builder.publish"));

    expect(publish).toHaveBeenCalledWith("pln_1");
  });

  /**
   * La suppression demande confirmation avant de partir : un cycle effacé emporte ses semaines,
   * ses séances et sa facture brouillon, et rien ne le rend.
   */
  it("ne supprime qu'après confirmation", async () => {
    const { getByText, user } = await mount({});

    await user.click(getByText("plan.builder.delete"));
    expect(remove).not.toHaveBeenCalled();

    await user.click(getByText("common.confirmDelete"));
    expect(remove.mock.calls[0]?.[0]).toBe("pln_1");
  });

  // Un cycle auto-coaché ne se facture pas (#14) : le verrou de facturation n'a pas à s'y appliquer.
  it("ne réclame pas de facturation sur un cycle écrit pour soi", async () => {
    const { getByText } = await mount({ isBillingFilled: false, requiresBilling: false });

    expect((getByText("plan.builder.publish") as HTMLButtonElement).disabled).toBe(false);
  });
});
