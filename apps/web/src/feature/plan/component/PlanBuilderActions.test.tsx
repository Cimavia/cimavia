import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlanBuilderActions } from "@/feature/plan/component/PlanBuilderActions";
import { useDeletePlan, usePublishPlan } from "@/feature/plan/hook/usePlans";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/plan/hook/usePlans", () => ({
  useDeletePlan: vi.fn(),
  usePublishPlan: vi.fn(),
}));

const idle = { mutate: vi.fn(), isPending: false };
vi.mocked(useDeletePlan).mockReturnValue(idle as unknown as ReturnType<typeof useDeletePlan>);
vi.mocked(usePublishPlan).mockReturnValue(idle as unknown as ReturnType<typeof usePublishPlan>);

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

  // Un cycle auto-coaché ne se facture pas (#14) : le verrou de facturation n'a pas à s'y appliquer.
  it("ne réclame pas de facturation sur un cycle écrit pour soi", async () => {
    const { getByText } = await mount({ isBillingFilled: false, requiresBilling: false });

    expect((getByText("plan.builder.publish") as HTMLButtonElement).disabled).toBe(false);
  });
});
