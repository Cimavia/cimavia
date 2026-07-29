import type { InvoiceTiming } from "@cmv/shared";
import { InvoiceState, resolveInvoiceState, todayIsoDate } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge } from "@/shared/component";

/**
 * Le couple couleur ↔ état, en un seul endroit : « en retard » doit se voir sans lire la date, et
 * « annulée » doit au contraire s'effacer (neutre) — elle n'attend plus rien de personne.
 */
const STATE_BADGE = {
  [InvoiceState.PAID]: { variant: "success", labelKey: "invoice.status.paid" },
  [InvoiceState.PENDING]: { variant: "warning", labelKey: "invoice.status.pending" },
  [InvoiceState.OVERDUE]: { variant: "error", labelKey: "invoice.status.overdue" },
  [InvoiceState.CANCELLED]: { variant: "neutral", labelKey: "invoice.status.cancelled" },
} as const;

// Pastille d'état d'une facture émise. L'état est DÉRIVÉ (@cmv/shared) : « en retard » n'est pas
// un statut stocké, c'est une facture en attente dont l'échéance est passée.
export function InvoiceStatusBadge({ invoice }: Readonly<{ invoice: InvoiceTiming }>) {
  const { t } = useTranslation();
  const state = resolveInvoiceState(invoice, todayIsoDate());

  // Aucun état lisible (brouillon, date illisible) : « — », jamais un statut inventé.
  if (state == null) {
    return <span className="text-cmv-caption text-cmv-text-lo">—</span>;
  }

  const { variant, labelKey } = STATE_BADGE[state];
  return (
    <CmvBadge variant={variant} dot>
      {t(labelKey)}
    </CmvBadge>
  );
}
