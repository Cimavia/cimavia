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
   * Côté coach, seules les cibles qui ONT un écran mobile mènent quelque part : `INVOICE` (#32),
   * `SCHEDULED_SESSION` (#33) et `CONVERSATION` (#34). `PLAN` reste `null` définitivement — le
   * builder est web-only (#20), il n'y a pas d'écran mobile à viser.
   */
  if (capabilities.isCoach) {
    if (entityType === NotificationEntityType.INVOICE) return "/invoices";
    // Le coach reçoit `SCHEDULED_SESSION` pour un débrief reçu : on ouvre CE débrief, pas la liste.
    if (entityType === NotificationEntityType.SCHEDULED_SESSION) {
      return entityId == null ? null : `/feedbacks/${entityId}`;
    }
    // La liste des fils, pas un fil précis : `entityId` est l'id de la CONVERSATION, alors que la
    // route du coach attend l'id de l'ATHLÈTE. Ouvrir la liste reste très au-dessus de rien.
    if (entityType === NotificationEntityType.CONVERSATION) return "/messages";
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

/**
 * Le REPLI des rappels dus (#46). `REMINDER_DUE` est le seul type du centre dont la cible a une
 * seconde maison : l'écran « Mes rappels », où vivent les gestes (fait, abandonné, repoussé).
 *
 * Il ne REMPLACE pas la destination, il comble son absence. Une facture continue de mener à
 * `/invoices`, où le coach agit sur l'impayé ; un CYCLE, lui, ne menait **nulle part** — `PLAN` rend
 * `null` définitivement côté coach, le builder étant web-only (#20). Un rappel dû sur un cycle était
 * donc un cul-de-sac, exactement le cas que l'encadré « Appris en #20 » du journal de dette dit de
 * ne plus laisser passer.
 *
 * Écrit comme un repli et non comme un branchement sur le type : le jour où `ReminderEntityType`
 * gagne une valeur sans écran mobile, elle tombe ici plutôt que dans le vide.
 *
 * Côté WEB, rien d'équivalent n'est nécessaire : les deux cibles y résolvent déjà pour un coach
 * (`PLAN` → le builder, `INVOICE` → le suivi). Y ajouter ce repli serait du code mort, et y brancher
 * le type ferait perdre l'accès direct au builder — une régression, pas un alignement.
 */
export function routeForNotification(
  notification: NotificationDto,
  capabilities: Capabilities,
): Href | null {
  const target = targetFor(notification.entityType, notification.entityId, capabilities);
  if (target != null) return target;

  const isDueReminder = notification.type === NotificationType.REMINDER_DUE;
  return isDueReminder && capabilities.isCoach ? "/reminders" : null;
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
