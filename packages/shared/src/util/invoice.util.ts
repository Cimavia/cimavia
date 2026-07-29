// Logique pure des factures, partagée web ↔ mobile. Rien ici ne touche au réseau ni à l'horloge :
// la date du jour est TOUJOURS reçue en paramètre (todayIsoDate() est l'affaire de l'appelant).

import { InvoiceStatus } from "../dto/invoice.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { isIsoDate } from "./date.util";

/**
 * État d'une facture tel qu'il est MONTRÉ — distinct du statut stocké (`InvoiceStatus`).
 * `OVERDUE` n'existe pas en base : c'est `PENDING` dont l'échéance est passée. Le dériver plutôt
 * que le stocker évite un statut qui deviendrait faux à minuit sans que personne n'écrive en base.
 */
export const InvoiceState = {
  PENDING: "PENDING",
  OVERDUE: "OVERDUE",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;
export type InvoiceState = TypesValuesOf<typeof InvoiceState>;

// Le minimum pour situer une facture : son statut stocké et son échéance (date civile).
export type InvoiceTiming = { status: InvoiceStatus; dueDate: string };

/**
 * État d'affichage d'une facture à la date `today` (deux dates civiles « YYYY-MM-DD », donc
 * comparables telles quelles — pas de fuseau, pas de Date).
 *
 * `null` (rendu « — ») dans deux cas, jamais un état par défaut :
 *  - facture DRAFT : elle ne vit que dans le builder, l'afficher « en attente » serait un mensonge ;
 *  - date illisible : mieux vaut ne rien affirmer que d'annoncer un retard à tort.
 *
 * Une échéance qui tombe AUJOURD'HUI n'est pas en retard — le débiteur a sa journée.
 * Source UNIQUE de cette dérivation (web + mobile) : ne pas la reconstituer dans un composant.
 */
export function resolveInvoiceState(invoice: InvoiceTiming, today: string): InvoiceState | null {
  if (invoice.status === InvoiceStatus.PAID) return InvoiceState.PAID;
  if (invoice.status === InvoiceStatus.CANCELLED) return InvoiceState.CANCELLED;
  if (invoice.status !== InvoiceStatus.PENDING) return null;

  if (!isIsoDate(invoice.dueDate) || !isIsoDate(today)) return null;
  return invoice.dueDate < today ? InvoiceState.OVERDUE : InvoiceState.PENDING;
}
