import {
  type Capabilities,
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
} from "@cmv/shared";
import type { Href } from "expo-router";

/**
 * Où mène une notification. Une seule table de destinations pour les DEUX portes d'entrée :
 * ouvrir le push (payload Expo) et toucher une ligne du centre (#50). Les faire diverger, c'est
 * garantir qu'un jour l'une navigue et l'autre non.
 *
 * **La destination dépend de la CAPACITÉ**, et pas seulement du type — comme côté web (#25). Les
 * quatre destinations d'ici sont des écrans ATHLÈTE : `/planning`, `/session/:id` et `/messages`
 * appellent des routes `@Roles([ATHLETE])`. Y envoyer un coach ne l'égare pas, ça lui donne un
 * **403**. Tant que l'écran coach correspondant n'existe pas sur mobile, la bonne réponse est
 * `null` : le centre marque alors la notification lue et rafraîchit le cache sans naviguer — « il
 * s'est passé quelque chose », sans mentir sur l'endroit.
 *
 * Chaque écran mobile-coach branchera sa destination en arrivant : #32 pour `INVOICE`, #33 pour
 * `SCHEDULED_SESSION`, #34 pour `CONVERSATION`. `PLAN` restera `null` côté coach : le builder est
 * **web-only** (#20), il n'y a pas d'écran mobile à viser.
 *
 * `null` aussi sur un type inconnu — une app plus ancienne que l'API ne doit pas deviner.
 */
function targetFor(
  entityType: string,
  entityId: string | undefined,
  capabilities: Capabilities,
): Href | null {
  /**
   * Côté coach, seules les cibles qui ONT un écran mobile mènent quelque part. `INVOICE` depuis
   * #32, `SCHEDULED_SESSION` depuis #33 ; `CONVERSATION` suivra en #34. `PLAN` restera `null` :
   * le builder est web-only (#20), il n'y a pas d'écran mobile à viser.
   */
  if (capabilities.isCoach) {
    if (entityType === NotificationEntityType.INVOICE) return "/invoices";
    // Le coach reçoit `SCHEDULED_SESSION` pour un débrief reçu : on ouvre CE débrief, pas la liste.
    if (entityType === NotificationEntityType.SCHEDULED_SESSION) {
      return entityId == null ? null : `/feedbacks/${entityId}`;
    }
    return null;
  }

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

export function routeForNotification(
  notification: NotificationDto,
  capabilities: Capabilities,
): Href | null {
  return targetFor(notification.entityType, notification.entityId, capabilities);
}

/**
 * Payload d'un push Expo, écrit par `NotificationService`. Ses clés d'id sont HISTORIQUES
 * (`planId`, `scheduledSessionId`…) et propres à chaque type : une app déjà installée les lit,
 * on ne les renomme pas. D'où cette traduction vers la table commune plutôt qu'un second switch
 * de destinations.
 */
export function routeForPushPayload(data: unknown, capabilities: Capabilities): Href | null {
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
      return targetFor(NotificationEntityType.PLAN, payload.planId, capabilities);
    case NotificationType.FEEDBACK_RECEIVED:
      return targetFor(
        NotificationEntityType.SCHEDULED_SESSION,
        payload.scheduledSessionId,
        capabilities,
      );
    case NotificationType.MESSAGE_RECEIVED:
      return targetFor(NotificationEntityType.CONVERSATION, payload.conversationId, capabilities);
    case NotificationType.INVOICE_ISSUED:
      return targetFor(NotificationEntityType.INVOICE, payload.invoiceId, capabilities);
    default:
      return null;
  }
}
