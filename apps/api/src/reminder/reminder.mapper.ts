import type { NotificationDto, ReminderDto } from "@cmv/shared";
import { ReminderEntityType, reminderToNotificationDto } from "@cmv/shared";
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
    // `null` sur un rappel saisi à la main. Le libellé du motif n'est PAS construit ici : c'est le
    // client qui le rend via `REMINDER_REASON_KEY`, sinon on réintroduirait le texte figé en
    // français que #47 existe pour éviter.
    reason: row.reason,
    status: row.status,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Ligne → entrée du centre de notifications (#51). Le mapping lui-même vit dans `@cmv/shared`
 * (`reminderToNotificationDto`, pur et testé) ; ici on ne fait que convertir les `Date` de Prisma en
 * ISO. Ni `targetLabel` ni `status` ne sont nécessaires : le centre affiche la note, et seuls les
 * rappels dus y arrivent — d'où l'absence de résolution des libellés de cible sur ce chemin.
 */
export function toReminderFeedEntry(row: Reminder): NotificationDto {
  return reminderToNotificationDto({
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    note: row.note,
    // Sans le motif, un rappel auto-généré n'aurait RIEN à afficher dans le centre : sa note est
    // nulle par construction. C'est `reminderToNotificationDto` qui décide lequel des deux voyage,
    // et sous quelle forme — valeur pour la note, clé i18n pour le motif.
    reason: row.reason,
    readAt: row.readAt?.toISOString() ?? null,
    dueAt: row.dueAt.toISOString(),
  });
}
