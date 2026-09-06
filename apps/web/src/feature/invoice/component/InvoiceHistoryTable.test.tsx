import {
  INVOICE_HISTORY_PAGE_SIZE,
  type InvoiceDto,
  InvoiceStatus,
  shiftIsoDate,
  sortAthleteInvoices,
  todayIsoDate,
} from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { InvoiceHistoryTable } from "./InvoiceHistoryTable";

/**
 * Les échéances sont relatives à AUJOURD'HUI : « en retard » est un état dérivé de la date du jour,
 * et des dates en dur feraient basculer la suite au fil du calendrier.
 */
const daysAgo = (days: number) => shiftIsoDate(todayIsoDate(), -days) ?? todayIsoDate();
const inDays = (days: number) => shiftIsoDate(todayIsoDate(), days) ?? todayIsoDate();

function invoice(over: Partial<InvoiceDto> & Pick<InvoiceDto, "id">): InvoiceDto {
  return {
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
    dueDate: inDays(30),
    paidAt: null,
    note: null,
    documentUrl: null,
    documentFileName: null,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    ...over,
  };
}

function setup(invoices: readonly InvoiceDto[]) {
  const onOpenInvoice = vi.fn();
  return {
    ...renderWithProviders(
      <InvoiceHistoryTable
        invoices={sortAthleteInvoices(invoices, todayIsoDate())}
        onOpenInvoice={onOpenInvoice}
      />,
    ),
    onOpenInvoice,
  };
}

describe("InvoiceHistoryTable", () => {
  it("dit ce qui est arrivé à chaque facture, pas seulement sa date", () => {
    const { getByText } = setup([
      invoice({ id: "a", period: "2026-08", dueDate: daysAgo(20) }),
      invoice({
        id: "b",
        period: "2026-07",
        status: InvoiceStatus.PAID,
        paidAt: "2026-07-03T09:00:00Z",
      }),
      invoice({ id: "c", period: "2026-09" }),
    ]);

    expect(getByText("invoice.history.overdueOn")).toBeTruthy();
    expect(getByText("invoice.history.paidOn")).toBeTruthy();
    // Ni échue ni réglée : l'échéance seule, dite comme partout ailleurs.
    expect(getByText("invoice.dueLabel")).toBeTruthy();
  });

  it("barre le montant d'une facture annulée", () => {
    const { getByText } = setup([
      invoice({ id: "a", amountCents: 9000, status: InvoiceStatus.CANCELLED }),
    ]);
    // État terminal : plus personne ne doit rien, et le montant le dit.
    expect(getByText("90,00 €").className).toContain("line-through");
  });

  it("ouvre la facture cliquée", async () => {
    const { user, getByText, onOpenInvoice } = setup([
      invoice({ id: "inv_42", period: "2026-08" }),
    ]);

    await user.click(getByText("août 2026"));

    expect(onOpenInvoice).toHaveBeenCalledWith("inv_42");
  });

  it("ne pagine pas ce qui tient sur une page", () => {
    const { queryByText } = setup(
      Array.from({ length: INVOICE_HISTORY_PAGE_SIZE }, (_, index) =>
        invoice({ id: `inv_${index}`, period: `2026-0${index + 1}` }),
      ),
    );
    // Une pagination qui ne pagine rien est du bruit.
    expect(queryByText("invoice.history.range")).toBeNull();
  });

  it("découpe par cinq au-delà, et change de page", async () => {
    const invoices = Array.from({ length: 7 }, (_, index) =>
      invoice({
        id: `inv_${index}`,
        // Mois décroissants : la plus récente d'abord, comme l'ordre du paquet partagé.
        period: `2026-0${7 - index}`,
        status: InvoiceStatus.PAID,
        paidAt: "2026-07-03T09:00:00Z",
      }),
    );
    const { user, getByRole, getByText, queryByText } = setup(invoices);

    expect(getByText("invoice.history.range")).toBeTruthy();
    expect(getByText("juillet 2026")).toBeTruthy();
    // La sixième et la septième sont en page 2.
    expect(queryByText("février 2026")).toBeNull();

    await user.click(getByRole("button", { name: "2" }));

    expect(getByText("février 2026")).toBeTruthy();
    expect(queryByText("juillet 2026")).toBeNull();
  });
});
