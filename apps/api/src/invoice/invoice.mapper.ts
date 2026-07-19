import type { InvoiceCurrency, InvoiceDto, InvoiceStatusType } from "@cmv/shared";
import type { Invoice } from "@prisma/client";
import { toIsoDate } from "../util/date.util";

/**
 * Facture Prisma → DTO. Les noms (coach ET athlète) sont passés en argument : ils viennent d'une
 * requête SCOPÉE à part (UserDirectoryService, table User hors scope tenant), jamais d'un `include`
 * imbriqué — qui échapperait au scope (piège n°2 du multi-tenant). Hors du service (règle archi).
 */
export function toInvoiceDto(invoice: Invoice, names: Map<string, string>): InvoiceDto {
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
    period: invoice.period,
    amountCents: invoice.amountCents,
    currency: invoice.currency as InvoiceCurrency,
    status: invoice.status as InvoiceStatusType,
    issuedAt: invoice.issuedAt.toISOString(),
    dueDate: toIsoDate(invoice.dueDate),
    // null tant qu'impayée — rendu « — » côté client (jamais un fallback silencieux).
    paidAt: invoice.paidAt?.toISOString() ?? null,
    note: invoice.note,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
}
