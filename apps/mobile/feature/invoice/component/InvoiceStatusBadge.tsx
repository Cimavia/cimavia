import type { InvoiceTiming } from "@cmv/shared";
import { INVOICE_STATE_BADGE, resolveInvoiceState, todayIsoDate } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvBadge, CmvText } from "@/shared/component";

// Pastille d'état d'une facture émise. L'état est DÉRIVÉ et sa couleur décidée dans @cmv/shared
// (INVOICE_STATE_BADGE) : « en retard » n'est pas un statut stocké, c'est une facture en attente
// dont l'échéance est passée.
export function InvoiceStatusBadge({ invoice }: Readonly<{ invoice: InvoiceTiming }>) {
  const { t } = useTranslation();
  const state = resolveInvoiceState(invoice, todayIsoDate());

  // Aucun état lisible (brouillon, date illisible) : « — », jamais un statut inventé.
  if (state == null) {
    return <CmvText className="text-cmv-text-lo text-xs">—</CmvText>;
  }

  const { variant, labelKey } = INVOICE_STATE_BADGE[state];
  return <CmvBadge label={t(labelKey)} variant={variant} dot />;
}
