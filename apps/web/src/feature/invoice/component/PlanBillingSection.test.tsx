import { describe, expect, it, vi } from "vitest";
import { PlanBillingSection } from "@/feature/invoice/component/PlanBillingSection";
import {
  useAttachInvoiceDocument,
  usePlanBilling,
  useRemoveInvoiceDocument,
  useSavePlanBilling,
} from "@/feature/invoice/hook/useInvoices";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/invoice/hook/useInvoices", () => ({
  usePlanBilling: vi.fn(),
  useSavePlanBilling: vi.fn(),
  useAttachInvoiceDocument: vi.fn(),
  useRemoveInvoiceDocument: vi.fn(),
}));

const idle = { mutate: vi.fn(), isPending: false };
vi.mocked(useSavePlanBilling).mockReturnValue(
  idle as unknown as ReturnType<typeof useSavePlanBilling>,
);
vi.mocked(useAttachInvoiceDocument).mockReturnValue(
  idle as unknown as ReturnType<typeof useAttachInvoiceDocument>,
);
vi.mocked(useRemoveInvoiceDocument).mockReturnValue(
  idle as unknown as ReturnType<typeof useRemoveInvoiceDocument>,
);
vi.mocked(usePlanBilling).mockReturnValue({
  data: null,
} as unknown as ReturnType<typeof usePlanBilling>);

const mount = (props: { isPublished?: boolean; hasAthlete?: boolean }) =>
  renderInRoute(
    <PlanBillingSection planId="pln_1" isPublished={false} hasAthlete={true} {...props} />,
    { path: "/plans/$planId", params: { planId: "pln_1" }, links: ["/invoices"] },
  );

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
   * L'API refuse cette lecture en 409 sans destinataire : la poser quand même coûterait deux
   * requêtes vouées à l'échec pour une réponse qu'on connaît déjà.
   */
  it("ne demande pas les termes d'un cycle qu'on ne peut pas facturer", async () => {
    await mount({ hasAthlete: false });

    expect(usePlanBilling).toHaveBeenCalledWith("pln_1", false);
  });

  it("cède la place au suivi une fois le cycle diffusé", async () => {
    const { getByText, queryByText } = await mount({ isPublished: true });

    expect(getByText("invoice.billing.trackLink")).toBeTruthy();
    expect(queryByText("invoice.billing.save")).toBeNull();
  });
});
