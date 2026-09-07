import type { PlanAudience } from "@cmv/shared";
import { PlanStatus } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { PlanStatusLine } from "@/feature/plan/component/PlanStatusLine";
import { renderWithProviders } from "../../../../test/render";

const TITLES = new Map([
  ["pln_bloc", "Cycle Bloc"],
  ["pln_falaise", "Prépa falaise"],
]);

const DRAFT = {
  status: PlanStatus.DRAFT,
  hasAthlete: true,
  isBillingFilled: true,
  requiresBilling: true,
  audience: { kind: "NOT_PUBLISHED" } as PlanAudience,
  titlesById: TITLES,
} as const;

const published = (audience: PlanAudience | null) =>
  ({ ...DRAFT, status: PlanStatus.PUBLISHED, audience }) as const;

/**
 * Ce que la ligne de statut DIT qu'il manque. L'ordre des manques est une décision (#144) : le
 * destinataire avant la facturation, comme les verrous de l'API.
 */
describe("PlanStatusLine — ce qui manque pour diffuser", () => {
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

  // Un cycle diffusé n'a plus rien à réclamer : il annonce ce que son athlète en voit.
  it("ne réclame rien sur un cycle diffusé, même sans destinataire lisible", () => {
    const { queryByText } = renderWithProviders(
      <PlanStatusLine
        {...published({ kind: "VISIBLE_ALONE" })}
        hasAthlete={false}
        isBillingFilled={false}
      />,
    );

    expect(queryByText("plan.builder.athleteRequired")).toBeNull();
    expect(queryByText("plan.builder.billingRequired")).toBeNull();
  });
});

/**
 * Le cœur de #172 : le constructeur affirmait « L'athlète voit ce cycle » dès la diffusion, sans
 * condition. Il dit désormais LAQUELLE des six situations est vraie — ou se tait.
 */
describe("PlanStatusLine — ce que l'athlète voit du cycle", () => {
  it("annonce la date d'un cycle diffusé qui n'a pas encore commencé", () => {
    const { getByText } = renderWithProviders(
      <PlanStatusLine {...published({ kind: "VISIBLE_UPCOMING", startDate: "2026-11-09" })} />,
    );

    expect(getByText(/plan\.builder\.audience\.VISIBLE_UPCOMING/)).toBeTruthy();
  });

  it("confirme la visibilité d'un cycle en cours et seul à l'être", () => {
    const { getByText } = renderWithProviders(
      <PlanStatusLine {...published({ kind: "VISIBLE_ALONE" })} />,
    );

    expect(getByText("plan.builder.audience.VISIBLE_ALONE")).toBeTruthy();
  });

  it("nomme les cycles que l'athlète mène en parallèle", () => {
    const { getByText } = renderWithProviders(
      <PlanStatusLine {...published({ kind: "VISIBLE_WITH", otherPlanIds: ["pln_falaise"] })} />,
    );

    expect(getByText(/plan\.builder\.audience\.VISIBLE_WITH/)).toBeTruthy();
  });

  it("dit d'un cycle terminé et remplacé ce que l'athlète suit désormais", () => {
    const { getByText } = renderWithProviders(
      <PlanStatusLine {...published({ kind: "ENDED_SUPERSEDED", insteadPlanIds: ["pln_bloc"] })} />,
    );

    expect(getByText(/plan\.builder\.audience\.ENDED_SUPERSEDED/)).toBeTruthy();
  });

  it("dit d'un cycle terminé sans suite qu'il reste le dernier reçu", () => {
    const { getByText } = renderWithProviders(
      <PlanStatusLine {...published({ kind: "ENDED_LAST" })} />,
    );

    expect(getByText("plan.builder.audience.ENDED_LAST")).toBeTruthy();
  });

  /**
   * L'invariant qui corrige #172 : tant qu'on ne SAIT pas, on ne dit rien. Une phrase par défaut
   * est exactement ce qui a laissé le constructeur affirmer le faux pendant des semaines.
   */
  it("se tait tant que l'audience n'est pas connue", () => {
    const { container } = renderWithProviders(<PlanStatusLine {...published(null)} />);

    expect(container.textContent).not.toContain("plan.builder.audience");
  });
});
