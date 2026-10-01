import { InvoiceStatus } from "../dto/invoice.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { isIsoDate } from "./date.util";

export const InvoiceState = {
  PENDING: "PENDING",
  OVERDUE: "OVERDUE",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;
export type InvoiceState = TypesValuesOf<typeof InvoiceState>;

export type InvoiceTiming = { status: InvoiceStatus; dueDate: string };

export type InvoiceStateBadge = {
  variant: "success" | "warning" | "error" | "neutral";
  labelKey: string;
};

export const INVOICE_STATE_BADGE = {
  [InvoiceState.PAID]: { variant: "success", labelKey: "invoice.status.paid" },
  [InvoiceState.PENDING]: { variant: "warning", labelKey: "invoice.status.pending" },
  [InvoiceState.OVERDUE]: { variant: "error", labelKey: "invoice.status.overdue" },
  [InvoiceState.CANCELLED]: { variant: "neutral", labelKey: "invoice.status.cancelled" },
} as const satisfies Record<InvoiceState, InvoiceStateBadge>;

export function resolveInvoiceState(invoice: InvoiceTiming, today: string): InvoiceState | null {
  if (invoice.status === InvoiceStatus.PAID) return InvoiceState.PAID;
  if (invoice.status === InvoiceStatus.CANCELLED) return InvoiceState.CANCELLED;
  if (invoice.status !== InvoiceStatus.PENDING) return null;

  if (!isIsoDate(invoice.dueDate) || !isIsoDate(today)) return null;
  return invoice.dueDate < today ? InvoiceState.OVERDUE : InvoiceState.PENDING;
}

// ── Pied du détail d'une facture ─────────────────────────────────────────────

/** Les gestes offerts au pied du détail d'une facture. */
export const InvoiceFooter = {
  /** Rien : athlète, facture annulée ou pas encore émise. */
  NONE: "NONE",
  /** Payée : le seul geste est le retour arrière. */
  REOPEN: "REOPEN",
  /** À régler : marquer payée, programmer un rappel, annuler. */
  SETTLE: "SETTLE",
} as const;
export type InvoiceFooter = TypesValuesOf<typeof InvoiceFooter>;

/**
 * Ce que le pied du détail d'une facture propose — commun au panneau web et au détail mobile, qui
 * l'écrivaient chacun (#505).
 *
 * Rien pour l'athlète, et pas par politesse : `PATCH /invoices/:id/status` et
 * `POST /invoices/:id/cancel` sont gardées `@Roles([COACH])`, et le rappel touche `Reminder`, la
 * seule entité scopée `coachId` SEUL. Rien non plus sur une facture annulée (terminal, l'API refuse
 * tout retour en 409) : un pied vide vaut mieux qu'un bouton éteint, qui laisse chercher ce qui le
 * rallumerait.
 *
 * Une facture DRAFT n'atteint pas le détail (les lectures ne servent que des factures émises) ; si
 * elle l'atteignait, elle n'aurait rien à proposer — le toggle ne pose que payée ↔ impayée.
 */
export function invoiceFooter(status: InvoiceStatus, canManage: boolean): InvoiceFooter {
  if (!canManage) return InvoiceFooter.NONE;
  if (status === InvoiceStatus.PAID) return InvoiceFooter.REOPEN;
  if (status === InvoiceStatus.PENDING) return InvoiceFooter.SETTLE;
  return InvoiceFooter.NONE;
}

// ── Compteurs de tuiles ──────────────────────────────────────────────────────

/**
 * Combien de factures dans cet état d'affichage. `null` en entrée → `null` en sortie : une liste
 * absente (chargement, panne) doit rendre « — », jamais un `0` qui annoncerait faussement que tout
 * est réglé (règle nullable).
 *
 * Une facture dont l'état ne se résout pas (DRAFT, date illisible) n'entre dans aucun compteur —
 * `resolveInvoiceState` rend `null`, et on ne devine pas à sa place.
 */
function countInvoicesInState(
  invoices: readonly InvoiceTiming[] | null | undefined,
  today: string,
  state: InvoiceState,
): number | null {
  if (invoices == null) return null;
  return invoices.filter((invoice) => resolveInvoiceState(invoice, today) === state).length;
}

/**
 * Les factures **émises et pas encore échues**.
 *
 * Attention, ce n'est PAS `status === PENDING` : une facture en retard porte ce statut-là aussi
 * (`OVERDUE` est dérivé, jamais stocké). Compter le statut brut ferait apparaître chaque facture en
 * retard ici ET dans `countOverdueInvoices` — le coach lirait deux fois la même facture, et la tuile
 * « à échéance » rangerait parmi les factures qui vont bien celles qui ne vont justement pas bien.
 *
 * Avec cette définition, les deux compteurs **partitionnent** l'impayé :
 * `countPendingInvoices + countOverdueInvoices = total des factures non réglées`.
 */
export function countPendingInvoices(
  invoices: readonly InvoiceTiming[] | null | undefined,
  today: string,
): number | null {
  return countInvoicesInState(invoices, today, InvoiceState.PENDING);
}

// Les factures dont l'échéance est dépassée — celles que le coach doit relancer. Disjoint de
// `countPendingInvoices` par construction (cf. son commentaire).
export function countOverdueInvoices(
  invoices: readonly InvoiceTiming[] | null | undefined,
  today: string,
): number | null {
  return countInvoicesInState(invoices, today, InvoiceState.OVERDUE);
}
