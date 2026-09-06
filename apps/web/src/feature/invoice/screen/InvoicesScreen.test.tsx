import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import {
  useCancelInvoice,
  useInvoices,
  useUpdateInvoiceStatus,
} from "@/feature/invoice/hook/useInvoices";
import { InvoicesScreen } from "@/feature/invoice/screen/InvoicesScreen";
import { useActingCapability } from "@/shared/hook/useCapabilities";
import { renderWithProviders } from "../../../../test/render";

/**
 * Ce qui s'éprouve ici est le CÂBLAGE que #120 a déplacé : la carte n'agit plus, elle ouvre — et
 * le panneau agit sur la facture du cache, pas sur une copie. Le contenu du panneau a ses propres
 * tests, les dérivations les leurs.
 */
vi.mock("@/feature/invoice/hook/useInvoices", () => ({
  useInvoices: vi.fn(),
  useUpdateInvoiceStatus: vi.fn(),
  useCancelInvoice: vi.fn(),
}));
vi.mock("@/shared/hook/useCapabilities", () => ({ useActingCapability: vi.fn() }));
// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({ title, children }: Readonly<{ title: string; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      {children as never}
    </div>
  ),
}));

const PENDING: InvoiceDto = {
  id: "inv_1",
  coachId: "usr_coach",
  coachName: "Marc Keller",
  athleteId: "usr_lea",
  athleteName: "Léa Bonnet",
  planId: "pln_1",
  planTitle: "Prépa bloc hiver",
  period: "2026-08",
  amountCents: 18000,
  currency: "EUR",
  status: InvoiceStatus.PENDING,
  issuedAt: "2026-07-01T09:00:00Z",
  dueDate: "2026-08-05",
  paidAt: null,
  note: null,
  documentUrl: null,
  documentFileName: null,
  createdAt: "2026-07-01T09:00:00Z",
  updatedAt: "2026-07-01T09:00:00Z",
};

const OTHER: InvoiceDto = { ...PENDING, id: "inv_2", athleteName: "Théo Marchand" };

type QueryState = { data?: InvoiceDto[]; isPending?: boolean; isError?: boolean };

function setup(state: QueryState = { data: [PENDING, OTHER] }, capability = "coach") {
  const mutate = vi.fn();
  const cancelMutate = vi.fn();
  const refetch = vi.fn();
  vi.mocked(useInvoices).mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    refetch,
  } as unknown as ReturnType<typeof useInvoices>);
  vi.mocked(useUpdateInvoiceStatus).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateInvoiceStatus>);
  vi.mocked(useCancelInvoice).mockReturnValue({
    mutate: cancelMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCancelInvoice>);
  vi.mocked(useActingCapability).mockReturnValue(
    capability as ReturnType<typeof useActingCapability>,
  );

  return { ...renderWithProviders(<InvoicesScreen />), mutate, cancelMutate, refetch };
}

describe("InvoicesScreen", () => {
  it("ouvre le panneau de la facture cliquée, et d'elle seule", async () => {
    const { user, getByRole, queryByRole } = setup();

    expect(queryByRole("complementary")).toBeNull();
    await user.click(getByRole("button", { name: /Théo Marchand/ }));

    expect(getByRole("complementary", { name: "Théo Marchand · août 2026" })).toBeTruthy();
  });

  it("referme le panneau sans toucher à la facture", async () => {
    const { user, getByRole, queryByRole, mutate } = setup();

    await user.click(getByRole("button", { name: /Léa Bonnet/ }));
    await user.click(getByRole("button", { name: "Fermer" }));

    expect(queryByRole("complementary")).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("marque payée la facture OUVERTE, et non une autre", async () => {
    const { user, getByRole, mutate } = setup();

    await user.click(getByRole("button", { name: /Théo Marchand/ }));
    await user.click(getByRole("button", { name: "invoice.markPaid" }));

    expect(mutate).toHaveBeenCalledWith({ id: "inv_2", status: InvoiceStatus.PAID });
  });

  it("annule la facture ouverte, une fois la confirmation donnée", async () => {
    const { user, getByRole, cancelMutate } = setup();

    await user.click(getByRole("button", { name: /Léa Bonnet/ }));
    await user.click(getByRole("button", { name: "invoice.cancel" }));
    await user.click(getByRole("button", { name: "invoice.cancelConfirm" }));

    expect(cancelMutate).toHaveBeenCalledWith("inv_1");
  });

  /**
   * LE point du câblage par id. Une copie de la facture figerait le panneau sur l'état d'avant, et
   * il proposerait encore « Marquer payée » sur une facture qui vient de l'être.
   */
  it("suit la facture mise à jour dans le cache, panneau ouvert", async () => {
    const { user, getByRole, queryByRole, rerender } = setup({ data: [PENDING] });

    await user.click(getByRole("button", { name: /Léa Bonnet/ }));
    expect(getByRole("button", { name: "invoice.markPaid" })).toBeTruthy();

    vi.mocked(useInvoices).mockReturnValue({
      data: [{ ...PENDING, status: InvoiceStatus.PAID, paidAt: "2026-08-02T09:00:00Z" }],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useInvoices>);
    rerender(<InvoicesScreen />);

    expect(queryByRole("button", { name: "invoice.markPaid" })).toBeNull();
    expect(getByRole("button", { name: "invoice.reopen" })).toBeTruthy();
  });

  it("rouvre depuis le panneau une facture marquée payée à tort", async () => {
    const paid = { ...PENDING, status: InvoiceStatus.PAID, paidAt: "2026-08-02T09:00:00Z" };
    const { user, getByRole, mutate } = setup({ data: [paid] });

    await user.click(getByRole("button", { name: /Léa Bonnet/ }));
    await user.click(getByRole("button", { name: "invoice.reopen" }));
    await user.click(getByRole("button", { name: "invoice.reopenConfirm" }));

    expect(mutate).toHaveBeenCalledWith({ id: "inv_1", status: InvoiceStatus.PENDING });
  });

  it("relance la requête depuis l'état d'erreur", async () => {
    const { user, getByRole, refetch } = setup({ isError: true });

    await user.click(getByRole("button", { name: "common.retry" }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  it("distingue le vide, l'erreur et le chargement", () => {
    const { getByText, unmount } = setup({ data: [] });
    expect(getByText("invoice.empty.title")).toBeTruthy();
    unmount();

    const errored = setup({ isError: true });
    expect(errored.getByText("common.errorTitle")).toBeTruthy();
    errored.unmount();

    // « Aucune facture » pendant le chargement serait un mensonge : trois états, trois rendus.
    const loading = setup({ isPending: true });
    expect(loading.getByText("common.loading")).toBeTruthy();
    expect(loading.queryByText("invoice.empty.title")).toBeNull();
  });

  it("titre l'écran au titre EXERCÉ, et n'ouvre aucun geste à l'athlète", async () => {
    const { user, getByRole, queryByRole, getByText } = setup({ data: [PENDING] }, "athlete");

    expect(getByText("invoice.athlete.title")).toBeTruthy();
    await user.click(getByRole("button", { name: /invoice.byCoach/ }));

    expect(queryByRole("button", { name: "invoice.markPaid" })).toBeNull();
    expect(queryByRole("button", { name: "invoice.cancel" })).toBeNull();
  });
});
