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
  isHeaderUnsaved: false,
  isBillingUnsaved: false,
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
   * La diffusion part avec le cycle ENREGISTRÉ (#326) : un destinataire corrigé mais pas enregistré
   * envoyait le cycle, sa notification et sa facture à l'ancien — sans retour possible.
   */
  it("ne diffuse pas tant que l'en-tête n'est pas enregistré, et dit pourquoi", async () => {
    const { getByText, getByTitle, user } = await mount({ isHeaderUnsaved: true });

    await user.click(getByText("plan.builder.publish"));

    expect(publish).not.toHaveBeenCalled();
    expect(getByTitle("plan.builder.headerUnsaved")).toContainElement(
      getByText("plan.builder.publish").closest("button"),
    );
  });

  // Le coach vient de choisir quelqu'un : « choisis le destinataire » lui dirait l'inverse.
  it("demande d'enregistrer l'en-tête plutôt que de réclamer le destinataire", async () => {
    const { getByTitle, queryByTitle } = await mount({ isHeaderUnsaved: true, hasAthlete: false });

    expect(getByTitle("plan.builder.headerUnsaved")).toBeTruthy();
    expect(queryByTitle("plan.builder.athleteRequired")).toBeNull();
  });

  it("ne diffuse pas tant que la facturation n'est pas enregistrée, et dit pourquoi", async () => {
    const { getByText, getByTitle, user } = await mount({ isBillingUnsaved: true });

    await user.click(getByText("plan.builder.publish"));

    expect(publish).not.toHaveBeenCalled();
    expect(getByTitle("plan.builder.billingUnsaved")).toBeTruthy();
  });

  // Des termes saisis pour la première fois : il ne manque plus que de les enregistrer.
  it("demande d'enregistrer la facturation plutôt que de la réclamer", async () => {
    const { getByTitle, queryByTitle } = await mount({
      isBillingUnsaved: true,
      isBillingFilled: false,
    });

    expect(getByTitle("plan.builder.billingUnsaved")).toBeTruthy();
    expect(queryByTitle("plan.builder.billingRequired")).toBeNull();
  });

  it("nomme l'en-tête avant la facturation quand les deux attendent", async () => {
    const { getByTitle } = await mount({ isHeaderUnsaved: true, isBillingUnsaved: true });

    expect(getByTitle("plan.builder.headerUnsaved")).toBeTruthy();
  });

  // L'enregistrement de l'en-tête, comme toute autre écriture du builder, se termine d'abord.
  it("ferme la diffusion pendant une écriture du builder", async () => {
    const { getByText } = await mount({ isBusy: true });

    expect(getByText("plan.builder.publish").closest("button")).toBeDisabled();
  });

  it("ne dit rien d'une saisie en attente sur un cycle déjà diffusé", async () => {
    const { queryByTitle } = await mount({ isPublished: true, isHeaderUnsaved: true });

    expect(queryByTitle("plan.builder.headerUnsaved")).toBeNull();
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

  // Le cycle n'existe plus : rester sur son constructeur montrerait une page sans objet.
  it("ramène à la liste des planifications une fois le cycle supprimé", async () => {
    remove.mockImplementation((_id: string, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    const { getByText, router, user } = await mount({});

    await user.click(getByText("plan.builder.delete"));
    await user.click(getByText("common.confirmDelete"));

    expect(router.state.location.pathname).toBe("/plans");
  });

  // La raison était posée, mais muette : le bouton la masquait sous son propre `title` (#313).
  it("ferme la suppression d'un cycle diffusé, et dit pourquoi", async () => {
    const { getByText, getByTitle } = await mount({ isPublished: true });

    const button = getByText("plan.builder.delete").closest("button");
    expect(button).toBeDisabled();
    expect(getByTitle("plan.builder.deleteDisabledPublished")).toContainElement(button);
  });

  // Un cycle auto-coaché ne se facture pas (#14) : le verrou de facturation n'a pas à s'y appliquer.
  it("ne réclame pas de facturation sur un cycle écrit pour soi", async () => {
    const { getByText } = await mount({ isBillingFilled: false, requiresBilling: false });

    expect((getByText("plan.builder.publish") as HTMLButtonElement).disabled).toBe(false);
  });
});
