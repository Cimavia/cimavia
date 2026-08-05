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
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
