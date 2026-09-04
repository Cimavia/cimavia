import { PlanStatus } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { PlanStatusLine } from "@/feature/plan/component/PlanStatusLine";
import { renderWithProviders } from "../../../../test/render";

const DRAFT = {
  status: PlanStatus.DRAFT,
  hasAthlete: true,
  isBillingFilled: true,
  requiresBilling: true,
} as const;

/**
 * Ce que la ligne de statut DIT qu'il manque. L'ordre des manques est une décision (#144) : le
 * destinataire avant la facturation, comme les verrous de l'API.
 */
describe("PlanStatusLine", () => {
  it("ne commente pas un brouillon prêt à partir", () => {
    const { queryByText } = renderWithProviders(<PlanStatusLine {...DRAFT} />);

    expect(queryByText("plan.builder.athleteRequired")).toBeNull();
    expect(queryByText("plan.builder.billingRequired")).toBeNull();
  });

  it("réclame le destinataire avant la facturation quand les deux manquent", () => {
    const { getByText, queryByText } = renderWithProviders(
      <PlanStatusLine {...DRAFT} hasAthlete={false} isBillingFilled={false} />,
    );

    expect(getByText("plan.builder.athleteRequired")).toBeTruthy();
    // Le second manque se tait tant que le premier n'est pas comblé : deux reproches à la fois
    // n'apprennent pas lequel traiter.
    expect(queryByText("plan.builder.billingRequired")).toBeNull();
  });

  it("réclame la facturation une fois le destinataire choisi", () => {
    const { getByText } = renderWithProviders(
      <PlanStatusLine {...DRAFT} isBillingFilled={false} />,
    );

    expect(getByText("plan.builder.billingRequired")).toBeTruthy();
  });

  // Un cycle diffusé n'a plus rien à réclamer : il annonce ce qu'il est, pas ce qui lui manque.
  it("ne réclame rien sur un cycle diffusé, même sans destinataire lisible", () => {
    const { getByText, queryByText } = renderWithProviders(
      <PlanStatusLine
        {...DRAFT}
        status={PlanStatus.PUBLISHED}
        hasAthlete={false}
        isBillingFilled={false}
      />,
    );

    expect(getByText("plan.builder.publishedHint")).toBeTruthy();
    expect(queryByText("plan.builder.athleteRequired")).toBeNull();
  });
});
