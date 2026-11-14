import {
  type Capabilities,
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
  notificationOpeningCapability,
  type TrainingCapability,
} from "@cmv/shared";
import { type Href, router } from "expo-router";

/**
 * Où mène une notification. Une seule table de destinations pour les DEUX portes d'entrée :
 * ouvrir le push (payload Expo) et toucher une ligne du centre (#50). Les faire diverger, c'est
 * garantir qu'un jour l'une navigue et l'autre non.
 *
 * **La destination dépend du TITRE sous lequel on l'ouvre** (#344), et pas seulement de la cible —
 * comme côté web (#25). Ce titre est celui de la notification (`notificationOpeningCapability`),
 * pas celui qu'on exerce ni toutes les capacités qu'on possède : un compte coach et athlète reçoit
 * un cycle EN athlète et un débrief EN coach, quel que soit le côté qu'il regarde. Les
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
/**
 * Le fil notifié, pour les deux rôles. `entityId` est l'id de la CONVERSATION, alors que la route
 * d'un fil attend l'interlocuteur : la liste reçoit le fil et le traduit, puis l'ouvre (#599) — un
 * athlète suivi par plusieurs coachs doit tomber sur le fil de celui qui a écrit. Sans id, la
 * liste seule reste très au-dessus de rien.
 */
function conversationTarget(entityId: string | undefined): Href {
  return entityId == null ? "/messages" : `/messages?conversation=${entityId}`;
}

function targetFor(
  entityType: string,
  entityId: string | undefined,
  capability: TrainingCapability,
): Href | null {
  /**
   * Côté coach, seules les cibles qui ONT un écran mobile mènent quelque part : `INVOICE` (#32),
   * `SCHEDULED_SESSION` (#33) et `CONVERSATION` (#34). `PLAN` reste `null` définitivement — le
   * builder est web-only (#20), il n'y a pas d'écran mobile à viser.
   */
  if (capability === "coach") {
    if (entityType === NotificationEntityType.INVOICE) return "/invoices";
    // Une invitation à laquelle on a répondu ramène le coach à son tableau de bord : c'est là que
    // le nouvel athlète apparaît, et c'est ce qu'on vient de lui annoncer (#146).
    if (entityType === NotificationEntityType.INVITATION) return "/dashboard";
    // Le coach reçoit `SCHEDULED_SESSION` pour un débrief reçu : on ouvre CE débrief, pas la liste.
    if (entityType === NotificationEntityType.SCHEDULED_SESSION) {
      return entityId == null ? null : `/feedbacks/${entityId}`;
    }
    if (entityType === NotificationEntityType.CONVERSATION) return conversationTarget(entityId);
    return null;
  }

  switch (entityType) {
    case NotificationEntityType.PLAN:
      return "/planning";
    // L'écran où l'invitation s'accepte — ou se refuse (#146).
    case NotificationEntityType.INVITATION:
      return "/join";
    case NotificationEntityType.SCHEDULED_SESSION:
      return entityId == null ? null : `/session/${entityId}`;
    case NotificationEntityType.CONVERSATION:
      return conversationTarget(entityId);
    case NotificationEntityType.INVOICE:
      return "/invoices";
    default:
      return null;
  }
}

/**
 * Où mène une notification, ET sous quel titre l'y ouvrir. Les deux voyagent ensemble : sur un
 * compte coach et athlète, Factures et Messagerie montrent le côté du sélecteur de titre (#129), et
 * une facture émise ouverte en titre coach y atterrirait sur les factures du coach. L'appelant
 * bascule donc le sélecteur sur `capability` avant de naviguer.
 */
export type NotificationDestination = { href: Href; capability: TrainingCapability };

/**
 * Ouvre une destination : bascule le sélecteur de titre, PUIS navigue — dans cet ordre, sinon
 * l'écran d'arrivée se rendrait une fois sous l'ancien titre. Le sélecteur n'est visible que pour
 * un compte qui cumule ; pour les autres, la question du titre ne se pose pas.
 *
 * Écrit une fois pour les deux portes d'entrée (la cloche et le push) : la table leur donne déjà
 * la même destination, ceci leur donne le même geste.
 */
export function openDestination(
  target: NotificationDestination | null,
  capabilitySwitch: Readonly<{
    visible: boolean;
    select: (capability: TrainingCapability) => void;
  }>,
): void {
  if (target == null) return;
  if (capabilitySwitch.visible) capabilitySwitch.select(target.capability);
  router.push(target.href);
}

function destination(
  href: Href | null,
  capability: TrainingCapability,
): NotificationDestination | null {
  return href == null ? null : { href, capability };
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
 * gagne une valeur sans écran mobile, elle tombe ici plutôt que dans le vide. Aucune garde de
 * capacité à poser : un rappel se reçoit en coach, et `notificationOpeningCapability` a déjà rendu
 * `null` au compte qui ne l'est plus.
 *
 * Côté WEB, rien d'équivalent n'est nécessaire : les deux cibles y résolvent déjà pour un coach
 * (`PLAN` → le builder, `INVOICE` → le suivi). Y ajouter ce repli serait du code mort, et y brancher
 * le type ferait perdre l'accès direct au builder — une régression, pas un alignement.
 *
 * `acting` est le titre exercé : il ne départage que ce que le type ne tranche pas (un message).
 */
export function routeForNotification(
  notification: NotificationDto,
  capabilities: Capabilities,
  acting: TrainingCapability,
): NotificationDestination | null {
  /**
   * Une invitation REFUSÉE ne mène nulle part, et c'est décidé AVANT la table — le seul type dont
   * la destination est SUPPRIMÉE plutôt que déduite.
   *
   * L'exact inverse du repli ci-dessous : `REMINDER_DUE` COMBLE une destination absente, celui-ci
   * en RETIRE une qui existe. La raison n'est pas que l'écran manque — le tableau de bord est là —
   * mais que l'ENTITÉ est morte : l'invitation refusée a quitté `PENDING`, elle ne s'affiche plus
   * dans le panneau du coach, et l'y envoyer le ferait chercher une ligne qui n'y est plus.
   */
  if (notification.type === NotificationType.INVITATION_DECLINED) return null;

  const capability = notificationOpeningCapability(notification.type, capabilities, acting);
  if (capability == null) return null;

  const target = targetFor(notification.entityType, notification.entityId, capability);
  const isDueReminder = notification.type === NotificationType.REMINDER_DUE;
  return destination(target ?? (isDueReminder ? "/reminders" : null), capability);
}

/**
 * Payload d'un push Expo, écrit par `NotificationService`. Ses clés d'id sont HISTORIQUES
 * (`planId`, `scheduledSessionId`…) et propres à chaque type : une app déjà installée les lit,
 * on ne les renomme pas. D'où cette traduction vers la table commune plutôt qu'un second switch
 * de destinations.
 */
export function routeForPushPayload(
  data: unknown,
  capabilities: Capabilities,
  acting: TrainingCapability,
): NotificationDestination | null {
  const payload = data as {
    type?: NotificationType;
    planId?: string;
    scheduledSessionId?: string;
    conversationId?: string;
    invoiceId?: string;
    reminderId?: string;
    invitationId?: string;
  } | null;
  if (payload?.type == null) return null;

  // Le même titre que la ligne du centre : c'est le TYPE qui le donne, et la charge utile le porte.
  const capability = notificationOpeningCapability(payload.type, capabilities, acting);
  if (capability == null) return null;
  const open = (entityType: NotificationEntityType, entityId: string | undefined) =>
    destination(targetFor(entityType, entityId, capability), capability);

  switch (payload.type) {
    /**
     * Un rappel dû (#47) ne passe PAS par `targetFor` : sa charge utile porte un `reminderId`, pas
     * l'id de sa cible — le push est émis sans lire le cycle ni la facture visés. Il mène donc
     * directement à « Mes rappels », qui est de toute façon le repli du centre pour ce type.
     *
     * Coach seul, et c'est déjà tenu : un rappel se reçoit en coach, le compte qui ne l'est plus
     * s'est arrêté plus haut.
     */
    case NotificationType.REMINDER_DUE:
      return destination("/reminders", capability);
    case NotificationType.PLAN_PUBLISHED:
    case NotificationType.PLAN_UPDATED:
    case NotificationType.PLAN_SESSION_ADDED:
    case NotificationType.PLAN_SESSION_REMOVED:
    case NotificationType.PLAN_SESSIONS_REORDERED:
      return open(NotificationEntityType.PLAN, payload.planId);
    case NotificationType.FEEDBACK_RECEIVED:
      return open(NotificationEntityType.SCHEDULED_SESSION, payload.scheduledSessionId);
    case NotificationType.MESSAGE_RECEIVED:
      return open(NotificationEntityType.CONVERSATION, payload.conversationId);
    case NotificationType.INVOICE_ISSUED:
      return open(NotificationEntityType.INVOICE, payload.invoiceId);
    /**
     * Les trois temps d'une invitation (#146). Leur clé d'id est `invitationId` — le typecheck ne
     * l'aurait PAS réclamée : cette fonction lit une charge utile `unknown`, et un type oublié
     * tomberait simplement dans le `default`. Un push qui ne mène nulle part là où la cloche mène
     * quelque part est précisément la divergence que cette traduction existe pour empêcher.
     *
     * Le refus est écarté ici comme il l'est dans la cloche : sa destination est supprimée, pas
     * absente.
     */
    case NotificationType.INVITATION_RECEIVED:
    case NotificationType.INVITATION_ACCEPTED:
    // L'invitation d'une entreprise (#601) ne vise que des Coachs : sa carte attend sur leur
    // tableau de bord, où la table mène déjà toute invitation reçue en coach.
    case NotificationType.ORGANIZATION_INVITATION_RECEIVED:
    // Le Coach qui rejoint une entreprise (#602) : l'athlète le retrouve dans « Mes coachs ».
    case NotificationType.ORGANIZATION_COACH_JOINED:
      return open(NotificationEntityType.INVITATION, payload.invitationId);
    default:
      // `INVITATION_DECLINED` compris : sa destination est supprimée, comme dans la cloche.
      return null;
  }
}
