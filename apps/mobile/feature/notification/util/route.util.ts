import { type NotificationDto, NotificationEntityType, NotificationType } from "@cmv/shared";
import type { Href } from "expo-router";

/**
 * Où mène une notification. Une seule table de destinations pour les DEUX portes d'entrée :
 * ouvrir le push (payload Expo) et toucher une ligne du centre (#50). Les faire diverger, c'est
 * garantir qu'un jour l'une navigue et l'autre non.
 *
 * `null` = on ne navigue pas, plutôt que de deviner — le cas d'une app plus ancienne que l'API.
 */
function targetFor(entityType: string, entityId: string | undefined): Href | null {
  switch (entityType) {
    case NotificationEntityType.PLAN:
      return "/planning";
    case NotificationEntityType.SCHEDULED_SESSION:
      return entityId == null ? null : `/session/${entityId}`;
    case NotificationEntityType.CONVERSATION:
      return "/messages";
    case NotificationEntityType.INVOICE:
      return "/invoices";
    default:
      return null;
  }
}

export function routeForNotification(notification: NotificationDto): Href | null {
  return targetFor(notification.entityType, notification.entityId);
}

/**
 * Payload d'un push Expo, écrit par `NotificationService`. Ses clés d'id sont HISTORIQUES
 * (`planId`, `scheduledSessionId`…) et propres à chaque type : une app déjà installée les lit,
 * on ne les renomme pas. D'où cette traduction vers la table commune plutôt qu'un second switch
 * de destinations.
 */
export function routeForPushPayload(data: unknown): Href | null {
  const payload = data as {
    type?: string;
    planId?: string;
    scheduledSessionId?: string;
    conversationId?: string;
    invoiceId?: string;
  } | null;

  switch (payload?.type) {
    case NotificationType.PLAN_PUBLISHED:
    case NotificationType.PLAN_UPDATED:
    case NotificationType.PLAN_SESSION_ADDED:
    case NotificationType.PLAN_SESSION_REMOVED:
      return targetFor(NotificationEntityType.PLAN, payload.planId);
    case NotificationType.FEEDBACK_RECEIVED:
      return targetFor(NotificationEntityType.SCHEDULED_SESSION, payload.scheduledSessionId);
    case NotificationType.MESSAGE_RECEIVED:
      return targetFor(NotificationEntityType.CONVERSATION, payload.conversationId);
    case NotificationType.INVOICE_ISSUED:
      return targetFor(NotificationEntityType.INVOICE, payload.invoiceId);
    default:
      return null;
  }
}
