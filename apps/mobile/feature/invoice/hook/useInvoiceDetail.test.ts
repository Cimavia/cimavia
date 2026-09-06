import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useInvoiceDetail } from "@/feature/invoice/hook/useInvoiceDetail";

/** Ce hook ne décide que d'une chose : quelle facture est ouverte. C'est ce qui s'éprouve ici. */

function invoice(id: string, status: InvoiceStatus = InvoiceStatus.PENDING): InvoiceDto {
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
    status,
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
  return renderHook(({ invoices }: { invoices: InvoiceDto[] }) => useInvoiceDetail(invoices), {
    initialProps: { invoices: initial },
  });
}

describe("useInvoiceDetail", () => {
  it("n'ouvre rien tant qu'aucune facture n'est demandée", () => {
    const { result } = setup([invoice("inv-1")]);

    expect(result.current.invoice).toBeNull();
  });

  /**
   * Le hook retient un ID et relit la facture dans la LISTE. C'est ce qui fait que le détail suit
   * l'état : marquée payée, la facture est remplacée dans le cache, et le pied propose alors le
   * geste inverse au lieu de rester figé sur celui d'avant.
   */
  it("relit la facture ouverte dans la liste à chaque rendu", () => {
    const { result, rerender } = setup([invoice("inv-1")]);

    act(() => result.current.open("inv-1"));
    expect(result.current.invoice?.status).toBe(InvoiceStatus.PENDING);

    rerender({ invoices: [invoice("inv-1", InvoiceStatus.PAID)] });
    expect(result.current.invoice?.status).toBe(InvoiceStatus.PAID);
  });

  /**
   * Une facture qui quitte la liste (rafraîchissement, athlète détaché) referme le détail d'elle-
   * même. Sans ça, il resterait un fantôme à l'écran, avec des boutons qui agiraient sur un id que
   * l'API ne connaît plus.
   */
  it("se referme quand la facture ouverte disparaît de la liste", () => {
    const { result, rerender } = setup([invoice("inv-1")]);

    act(() => result.current.open("inv-1"));
    expect(result.current.invoice).not.toBeNull();

    rerender({ invoices: [] });
    expect(result.current.invoice).toBeNull();
  });

  // Liste pas encore arrivée : rien d'ouvrable, et surtout pas d'exception sur un `undefined`.
  it("supporte une liste absente", () => {
    const { result } = renderHook(() => useInvoiceDetail(undefined));

    act(() => result.current.open("inv-1"));
    expect(result.current.invoice).toBeNull();
  });

  it("referme le détail sur demande", () => {
    const { result } = setup([invoice("inv-1")]);

    act(() => result.current.open("inv-1"));
    act(() => result.current.close());
    expect(result.current.invoice).toBeNull();
  });
});
