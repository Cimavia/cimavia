import type { NotificationDto } from "@cmv/shared";
import type { Notification } from "@prisma/client";

/**
 * Ligne → DTO. Aucun libellé n'est construit ici : la notification voyage avec ses PARAMÈTRES
 * (`actorName`, `subjectLabel`) et c'est le client qui la rend, dans sa langue (cf.
 * `NOTIFICATION_LABEL_KEY`). Un texte assemblé côté API serait figé en français.
 */
export function toNotificationDto(row: Notification): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    entityType: row.entityType,
    entityId: row.entityId,
    actorName: row.actorName,
    subjectLabel: row.subjectLabel,
    /**
     * Toujours `null` pour une notification PERSISTÉE : son sujet est une valeur (nom d'athlète,
     * titre de cycle), jamais une clé i18n. `subjectKey` n'existe que pour les entrées CALCULÉES —
     * aujourd'hui le seul rappel auto-généré, qui n'a pas de note à porter (#47). Aucune colonne
     * ne lui correspond en base, et c'est voulu.
     */
    subjectKey: null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
