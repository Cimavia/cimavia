import { type InvoiceDto, InvoiceStatus, sortAthleteInvoices } from "@cmv/shared";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InvoiceHistoryList } from "@/feature/invoice/component/InvoiceHistoryList";
import { pressButton, renderRn } from "@/test/render";

/**
 * L'ordre vient de `@cmv/shared` et y est mesuré. Ce qui s'éprouve ici est ce que la liste AJOUTE :
 * le découpage en pages, et ce qu'elle écrit sous chaque facture selon ce qui lui est arrivé.
 */

const TODAY = "2026-09-06";

function invoice(overrides: Partial<InvoiceDto> & { id: string }): InvoiceDto {
  return {
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
    ...overrides,
  };
}

function setup(invoices: InvoiceDto[]) {
  const onOpenInvoice = vi.fn();
  const { container } = renderRn(
    <InvoiceHistoryList
      invoices={sortAthleteInvoices(invoices, TODAY)}
      onOpenInvoice={onOpenInvoice}
    />,
  );
  return { onOpenInvoice, container };
}

/** Neuf factures mensuelles : de quoi dépasser la page de cinq. */
function nineMonths(): InvoiceDto[] {
  return Array.from({ length: 9 }, (_, index) =>
    invoice({
      id: `i-${index}`,
      period: `2026-0${index + 1}`,
      dueDate: `2026-0${index + 1}-05`,
      status: InvoiceStatus.PAID,
      paidAt: `2026-0${index + 1}-03T09:00:00.000Z`,
    }),
  );
}

describe("InvoiceHistoryList", () => {
  /**
   * Une facture EN RETARD dit depuis quand, en teinte d'alerte : c'est le seul endroit de la liste
   * où l'on voit à quel point il est ancien.
   */
  it("dit ce qui est arrivé à chaque facture", () => {
    setup([
      invoice({ id: "i-1" }),
      invoice({
        id: "i-2",
        period: "2026-05",
        status: InvoiceStatus.PAID,
        paidAt: "2026-05-03T09:00:00.000Z",
      }),
    ]);

    expect(screen.getByText(/invoice\.coach\.history\.overdueOn/)).toBeTruthy();
    expect(screen.getByText(/invoice\.coach\.history\.paidOn/)).toBeTruthy();
  });

  /**
   * Une facture ANNULÉE montre son ÉCHÉANCE, et non une date d'annulation : `InvoiceDto` n'en porte
   * aucune. En inventer une afficherait un jour qui n'existe pas — c'est l'erreur que la maquette
   * avait faite.
   */
  it("montre l'échéance d'une facture annulée, faute de date d'annulation", () => {
    setup([invoice({ id: "i-1", status: InvoiceStatus.CANCELLED })]);

    expect(screen.getByText(/invoice\.dueLabel/)).toBeTruthy();
    expect(screen.queryByText(/invoice\.coach\.history\.overdueOn/)).toBeNull();
  });

  // Une seule page : ni compteur ni boutons. Une pagination qui ne pagine rien est du bruit.
  it("ne pagine pas cinq factures ou moins", () => {
    setup([invoice({ id: "i-1" }), invoice({ id: "i-2", period: "2026-07" })]);

    expect(screen.queryByText(/invoice\.coach\.history\.range/)).toBeNull();
    expect(screen.queryByText("2")).toBeNull();
  });

  it("découpe l'historique en pages de cinq, et sert la page demandée", () => {
    const { container } = setup(nineMonths());

    expect(screen.getAllByText(/invoice\.coach\.history\.paidOn/)).toHaveLength(5);
    expect(screen.getByText(/invoice\.coach\.history\.range/)).toBeTruthy();

    pressButton(container, "2");
    // Neuf factures, cinq par page : la seconde en porte les quatre restantes.
    expect(screen.getAllByText(/invoice\.coach\.history\.paidOn/)).toHaveLength(4);
  });

  it("mène au détail de la facture touchée", () => {
    const { onOpenInvoice, container } = setup([invoice({ id: "i-1" })]);

    pressButton(container, "août 2026");
    expect(onOpenInvoice).toHaveBeenCalledWith("i-1");
  });
});
