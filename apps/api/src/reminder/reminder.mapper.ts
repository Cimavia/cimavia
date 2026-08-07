import type { ReminderDto } from "@cmv/shared";
import { ReminderEntityType } from "@cmv/shared";
import type { Reminder } from "@prisma/client";

/**
 * Libellés des cibles, indexés par type puis par id. Le type visé décide de la table lue, donc de
 * la map : deux `Map<id, label>` séparées, jamais une seule — deux modèles peuvent partager un id.
 */
export type ReminderTargetLabels = Record<ReminderEntityType, Map<string, string>>;

/**
 * Ligne → DTO. Le libellé de la cible est BRUT (titre du cycle, période « YYYY-MM » de la facture) :
 * c'est le client qui compose « Cycle — … » / « Facture — mars 2026 », via i18next et
 * `formatInvoicePeriod`. Assemblé ici, il serait figé en français — même raison que pour les
 * notifications, dont le libellé n'est ni stocké ni construit côté API.
 *
 * `targetLabel` vaut `null` quand la cible a disparu (`entityId` n'a pas de clé étrangère, dette
 * N-4) : le rappel reste lisible, sans nom de cible, et le rendu affiche « — ». Jamais un repli
 * silencieux.
 */
export function toReminderDto(row: Reminder, labels: ReminderTargetLabels): ReminderDto {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    targetLabel: labels[row.entityType].get(row.entityId) ?? null,
    dueAt: row.dueAt.toISOString(),
    note: row.note,
    status: row.status,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
