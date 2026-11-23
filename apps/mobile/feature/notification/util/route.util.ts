import {
  type Capabilities,
  type NotificationDto,
  NotificationEntityType,
  type NotificationEntityTypeType,
  NotificationType,
  notificationOpeningCapability,
  type PushTarget,
  pushTargetOf,
  type TrainingCapability,
} from "@cmv/shared";
import type { Href } from "expo-router";
import { type CapabilitySwitchControl, openUnder } from "@/shared/lib/open-under";

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
function conversationTarget(entityId: string | null): Href {
  return entityId == null ? "/messages" : `/messages?conversation=${entityId}`;
}

/**
 * Côté coach, seules les cibles qui ONT un écran mobile mènent quelque part : `INVOICE` (#32),
 * `SCHEDULED_SESSION` (#33) et `CONVERSATION` (#34). `PLAN` reste `null` définitivement — le
 * builder est web-only (#20), il n'y a pas d'écran mobile à viser.
 */
function coachTargetFor(
  entityType: NotificationEntityTypeType | null,
  entityId: string | null,
): Href | null {
  switch (entityType) {
    case NotificationEntityType.INVOICE:
      return "/invoices";
    // Une invitation à laquelle on a répondu ramène le coach à son tableau de bord : c'est là que
    // le nouvel athlète apparaît, et c'est ce qu'on vient de lui annoncer (#146).
    case NotificationEntityType.INVITATION:
    // Un athlète qui a quitté le coach (#909) : son tableau de bord, là où le suivi a pris fin.
    case NotificationEntityType.COACH_ATHLETE:
      return "/dashboard";
    // Le coach reçoit `SCHEDULED_SESSION` pour un débrief reçu : on ouvre CE débrief, pas la liste.
    case NotificationEntityType.SCHEDULED_SESSION:
      return entityId == null ? null : `/feedbacks/${entityId}`;
    case NotificationEntityType.CONVERSATION:
      return conversationTarget(entityId);
    default:
      return null;
  }
}

function targetFor(
  entityType: NotificationEntityTypeType | null,
  entityId: string | null,
  capability: TrainingCapability,
): Href | null {
  if (capability === "coach") return coachTargetFor(entityType, entityId);

  switch (entityType) {
    case NotificationEntityType.PLAN:
      return "/planning";
    // L'écran où l'invitation s'accepte — ou se refuse (#146).
    case NotificationEntityType.INVITATION:
    // « Mes coachs » vit sur le même écran : celui qui a mis fin au suivi y est rangé (#909).
    case NotificationEntityType.COACH_ATHLETE:
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
 * Ce qu'il faut savoir d'une notification pour la router : une ligne du centre, ou un push relu
 * par `pushTargetOf` — dont la cible peut manquer (`null` : indisponible, pas absente).
 */
type NotificationTarget = Pick<NotificationDto, "type" | "entityType" | "entityId"> | PushTarget;

/**
 * Ouvre une destination sous son titre — le geste d'`openUnder`, partagé avec les écrans d'un seul
 * titre (#343). `null` ne mène nulle part.
 *
 * Écrit une fois pour les deux portes d'entrée (la cloche et le push) : la table leur donne déjà
 * la même destination, ceci leur donne le même geste.
 */
export function openDestination(
  target: NotificationDestination | null,
  capabilitySwitch: CapabilitySwitchControl,
): void {
  if (target == null) return;
  openUnder(target.href, target.capability, capabilitySwitch);
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
  notification: NotificationTarget,
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
 * Où mène un push touché. Sa charge utile se relit par la table partagée (`pushTargetOf`, #351),
 * celle-là même qui l'a écrite côté API : ses clés d'id sont HISTORIQUES (`planId`,
 * `scheduledSessionId`…), une app déjà installée les lit, et ce client ne les recopie plus. La
 * cible relue prend ensuite le chemin de la cloche — un seul jeu de destinations pour les deux,
 * rappel dû compris : poussé sans sa cible, il tombe dans le même repli « Mes rappels ».
 */
export function routeForPushPayload(
  data: unknown,
  capabilities: Capabilities,
  acting: TrainingCapability,
): NotificationDestination | null {
  const target = pushTargetOf(data);
  return target == null ? null : routeForNotification(target, capabilities, acting);
}
