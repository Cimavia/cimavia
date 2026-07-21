import type { InvoiceCurrency, InvoiceDto, InvoiceStatusType } from "@cmv/shared";
import type { Invoice } from "@prisma/client";
import { toIsoDate } from "../util/date.util";

/**
 * Facture Prisma → DTO. Les noms (coach ET athlète) et le titre du cycle sont passés en argument :
 * ils viennent de requêtes SCOPÉES à part (UserDirectoryService / Plan), jamais d'un `include`
 * imbriqué — qui échapperait au scope (piège n°2 du multi-tenant). Hors du service (règle archi).
 */
export function toInvoiceDto(
  invoice: Invoice,
  names: Map<string, string>,
  planTitles: Map<string, string>,
): InvoiceDto {
  const coachName = names.get(invoice.coachId);
  const athleteName = names.get(invoice.athleteId);
  if (coachName == null || athleteName == null) {
    // Les deux sont garantis par des FK : une absence signale une incohérence de données, pas un
    // cas métier — on lève plutôt que d'afficher un trou (règle nullable).
    throw new Error(`[invoice] facture ${invoice.id} sans coach ou athlète résolu`);
  }
  return {
    id: invoice.id,
    coachId: invoice.coachId,
    coachName,
    athleteId: invoice.athleteId,
    athleteName,
    planId: invoice.planId,
    // null si hors-cycle (v1.0) ; le cycle étant en cascade, un planId présent a toujours son titre.
    planTitle: invoice.planId == null ? null : (planTitles.get(invoice.planId) ?? null),
    period: invoice.period,
    amountCents: invoice.amountCents,
    currency: invoice.currency as InvoiceCurrency,
    status: invoice.status as InvoiceStatusType,
    // null tant que DRAFT (non émise) ; posé au publish du cycle.
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    dueDate: toIsoDate(invoice.dueDate),
    // null tant qu'impayée — rendu « — » côté client (jamais un fallback silencieux).
    paidAt: invoice.paidAt?.toISOString() ?? null,
    note: invoice.note,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}
