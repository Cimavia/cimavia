import type { InvoiceDto } from "@cmv/shared";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanBillingSection } from "@/feature/invoice/component/PlanBillingSection";
import {
  useAttachInvoiceDocument,
  useRemoveInvoiceDocument,
  useSavePlanBilling,
} from "@/feature/invoice/hook/useInvoices";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/invoice/hook/useInvoices", () => ({
  useSavePlanBilling: vi.fn(),
  useAttachInvoiceDocument: vi.fn(),
  useRemoveInvoiceDocument: vi.fn(),
}));

const save = vi.fn();
const idle = { mutate: vi.fn(), isPending: false };
vi.mocked(useSavePlanBilling).mockReturnValue({
  mutate: save,
  isPending: false,
} as unknown as ReturnType<typeof useSavePlanBilling>);
vi.mocked(useAttachInvoiceDocument).mockReturnValue(
  idle as unknown as ReturnType<typeof useAttachInvoiceDocument>,
);
vi.mocked(useRemoveInvoiceDocument).mockReturnValue(
  idle as unknown as ReturnType<typeof useRemoveInvoiceDocument>,
);
// Remis à chaque test : les compteurs d'appel doivent repartir de zéro — un test qui enregistre
// ne doit pas décrire le suivant.
beforeEach(() => {
  vi.clearAllMocks();
});

// `billing` arrive en prop depuis le builder (#211) : la section ne lit plus rien elle-même. Par
// défaut « aucun terme saisi », l'état d'un cycle qu'on vient d'ouvrir.
const mount = (props: {
  isPublished?: boolean;
  hasAthlete?: boolean;
  billing?: InvoiceDto | null;
}) =>
  renderInRoute(
    <PlanBillingSection
      planId="pln_1"
      isPublished={false}
      hasAthlete={true}
      billing={null}
      {...props}
    />,
    { path: "/plans/$planId", params: { planId: "pln_1" }, links: ["/invoices"] },
  );

/**
 * jsdom n'exécute PAS l'algorithme de soumission d'un formulaire depuis un clic sur son bouton
 * `type="submit"` : l'événement `submit` doit être dispatché à la main, sinon le test observe un
 * clic qui ne déclenche rien et conclut à tort que le composant ne fait rien.
 */
function submit(container: HTMLElement): void {
  fireEvent.submit(container.querySelector("form") as HTMLFormElement);
}

describe("PlanBillingSection — le verrou de destinataire", () => {
  it("ouvre la saisie sur un brouillon adressé à quelqu'un", async () => {
    const { getByText } = await mount({});

    expect(getByText("invoice.billing.save")).toBeTruthy();
  });

  /**
   * Fermée, expliquée, jamais masquée : faire disparaître la section laisserait croire qu'un cycle
   * ne se facture pas, alors qu'il ne se facture pas ENCORE. Le titre reste, la phrase dit le
   * geste qui débloque (#144).
   */
  it("se ferme sans disparaître tant que le cycle n'a pas de destinataire", async () => {
    const { getByText, queryByText } = await mount({ hasAthlete: false });

    expect(getByText("invoice.billing.title")).toBeTruthy();
    expect(getByText("invoice.billing.athleteRequired")).toBeTruthy();
    expect(queryByText("invoice.billing.save")).toBeNull();
  });

  /**
   * Les euros saisis deviennent des CENTIMES entiers au dernier moment — jamais de float stocké.
   * `49,90 €` est le cas qui pique : `49.9 * 100` vaut `4989.999…` en flottant, et sans l'arrondi
   * la facture partirait à 49,89 €.
   */
  it("convertit les euros saisis en centimes entiers", async () => {
    const { container, user } = await mount({});

    await user.type(container.querySelector("#amount") as HTMLInputElement, "49.90");
    await user.type(container.querySelector("#dueDate") as HTMLInputElement, "2026-10-31");
    submit(container);

    expect(save).toHaveBeenCalledWith({
      amountCents: 4990,
      dueDate: "2026-10-31",
      note: null,
    });
  });

  /**
   * Un montant absent ou illisible n'est pas « zéro euro » : rien ne part. Le bouton est fermé, et
   * la garde de `onSubmit` tient quand même — un formulaire soumis au clavier ne passe pas par lui.
   */
  it("n'enregistre rien sans montant, bouton fermé ou pas", async () => {
    const { container, getByText, user } = await mount({});

    await user.type(container.querySelector("#dueDate") as HTMLInputElement, "2026-10-31");

    expect((getByText("invoice.billing.save") as HTMLButtonElement).disabled).toBe(true);
    submit(container);
    expect(save).not.toHaveBeenCalled();
  });

  // Les termes déjà enregistrés repeuplent le formulaire, montant réaffiché en EUROS.
  it("préremplit le formulaire avec les termes déjà saisis", async () => {
    const { container } = await mount({
      billing: {
        amountCents: 6000,
        dueDate: "2026-11-05",
        note: "Cycle automne",
      } as InvoiceDto,
    });

    expect((container.querySelector("#amount") as HTMLInputElement).value).toBe("60");
    expect((container.querySelector("#note") as HTMLTextAreaElement).value).toBe("Cycle automne");
  });

  it("cède la place au suivi une fois le cycle diffusé", async () => {
    const { getByText, queryByText } = await mount({ isPublished: true });

    expect(getByText("invoice.billing.trackLink")).toBeTruthy();
    expect(queryByText("invoice.billing.save")).toBeNull();
  });
});
