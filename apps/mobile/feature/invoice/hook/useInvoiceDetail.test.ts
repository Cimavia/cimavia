import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInvoiceDetail } from "@/feature/invoice/hook/useInvoiceDetail";
import { useCancelInvoice, useUpdateInvoiceStatus } from "@/feature/invoice/hook/useInvoices";

// La mutation a ses propres tests ; ce qui s'éprouve ici est le CHOIX de la facture ouverte.
vi.mock("@/feature/invoice/hook/useInvoices", () => ({
  useUpdateInvoiceStatus: vi.fn(),
  useCancelInvoice: vi.fn(),
}));

const mutate = vi.fn();
const cancelMutate = vi.fn();

function invoice(id: string): InvoiceDto {
  return {
    id,
    coachId: "c-1",
    coachName: "Dual Curl",
    athleteId: "a-1",
    athleteName: "Léa Bonnet",
    planId: "p-1",
    planTitle: "Prépa bloc hiver",
    period: "2026-08",
    amountCents: 18_000,
    currency: "EUR",
    status: InvoiceStatus.PENDING,
    issuedAt: "2026-07-25T08:00:00.000Z",
    dueDate: "2026-08-05",
    paidAt: null,
    note: null,
    documentUrl: null,
    documentFileName: null,
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt: "2026-07-25T08:00:00.000Z",
  };
}

function setup(initial: InvoiceDto[]) {
  vi.mocked(useUpdateInvoiceStatus).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateInvoiceStatus>);
  vi.mocked(useCancelInvoice).mockReturnValue({
    mutate: cancelMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCancelInvoice>);

  return renderHook(({ invoices }: { invoices: InvoiceDto[] }) => useInvoiceDetail(invoices), {
    initialProps: { invoices: initial },
  });
}

describe("useInvoiceDetail", () => {
  it("n'ouvre rien tant qu'aucune facture n'est demandée", () => {
    const { result } = setup([invoice("inv-1")]);

    expect(result.current.props).toBeNull();
  });

  /**
   * Le hook retient un ID et relit la facture dans la LISTE. C'est ce qui fait que le détail suit
   * l'état : marquée payée, la facture est remplacée dans le cache, et le pied propose alors le
   * geste inverse au lieu de rester figé sur celui d'avant.
   */
  it("relit la facture ouverte dans la liste à chaque rendu", () => {
    const { result, rerender } = setup([invoice("inv-1")]);

    act(() => result.current.open("inv-1"));
    expect(result.current.props?.invoice.status).toBe(InvoiceStatus.PENDING);

    const paid = { ...invoice("inv-1"), status: InvoiceStatus.PAID };
    rerender({ invoices: [paid] });
    expect(result.current.props?.invoice.status).toBe(InvoiceStatus.PAID);
  });

  /**
   * Une facture qui quitte la liste (rafraîchissement, athlète détaché) referme le détail d'elle-
   * même. Sans ça, il resterait un fantôme à l'écran, avec des boutons qui agiraient sur un id que
   * l'API ne connaît plus.
   */
  it("se referme quand la facture ouverte disparaît de la liste", () => {
    const { result, rerender } = setup([invoice("inv-1")]);

    act(() => result.current.open("inv-1"));
    expect(result.current.props).not.toBeNull();

    rerender({ invoices: [] });
    expect(result.current.props).toBeNull();
  });

  it("porte les deux gestes de statut sur la facture ouverte", () => {
    const { result } = setup([invoice("inv-1")]);
    act(() => result.current.open("inv-1"));

    result.current.props?.onMarkPaid();
    expect(mutate).toHaveBeenCalledWith({ id: "inv-1", status: InvoiceStatus.PAID });

    result.current.props?.onReopen();
    expect(mutate).toHaveBeenCalledWith({ id: "inv-1", status: InvoiceStatus.PENDING });
  });

  /**
   * L'annulation passe par son PROPRE endpoint, et non par le toggle de statut : `CANCELLED`
   * ouvert au toggle contournerait la garde qui l'interdit depuis autre chose que `PENDING`.
   */
  it("annule par l'endpoint dédié, jamais par le toggle de statut", () => {
    const { result } = setup([invoice("inv-1")]);
    act(() => result.current.open("inv-1"));

    result.current.props?.onCancel();
    expect(cancelMutate).toHaveBeenCalledWith("inv-1");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("referme le détail sur demande", () => {
    const { result } = setup([invoice("inv-1")]);
    act(() => result.current.open("inv-1"));

    act(() => result.current.props?.onClose());
    expect(result.current.props).toBeNull();
  });
});
