import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";

const invoice = (over: Partial<InvoiceDto>) =>
  ({ status: InvoiceStatus.PENDING, dueDate: "2020-08-05", ...over }) as InvoiceDto;

/**
 * L'état et sa couleur sont décidés dans `@cmv/shared` (`resolveInvoiceState`, `INVOICE_STATE_BADGE`)
 * et testés là-bas. Ce qui s'éprouve ici, c'est ce que la pastille fait d'une réponse — y compris
 * de l'absence de réponse.
 */
describe("InvoiceStatusBadge", () => {
  // « En retard » n'est pas stocké : une facture en attente dont l'échéance est passée.
  it("dit l'état dérivé, pas le statut stocké", () => {
    const { getByText, queryByText } = renderWithProviders(
      <InvoiceStatusBadge invoice={invoice({})} />,
    );

    expect(getByText("invoice.status.overdue")).toBeInTheDocument();
    expect(queryByText("invoice.status.pending")).toBeNull();
  });

  // Un brouillon n'a pas d'état émis à montrer : « — », jamais un statut inventé.
  it("rend « — » quand aucun état n'est lisible", () => {
    const { container } = renderWithProviders(
      <InvoiceStatusBadge invoice={invoice({ status: InvoiceStatus.DRAFT })} />,
    );

    expect(container.textContent).toBe("—");
  });
});
