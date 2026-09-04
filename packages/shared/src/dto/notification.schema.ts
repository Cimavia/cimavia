import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

/**
 * Notification PERSISTÉE (#48) — ce que le centre de notifications affiche, en plus du push déjà
 * émis par l'API sur les mêmes événements. Le push est éphémère (téléphone éteint, permission
 * refusée, compte web-only qui n'a aucun appareil enregistré) ; la notification, elle, reste
 * consultable. Les deux partent du même point (`NotificationService`), jamais l'un sans l'autre.
 */
export const NotificationType = {
  PLAN_PUBLISHED: "PLAN_PUBLISHED",
  // Les trois façons d'ajuster un cycle DÉJÀ diffusé (CDC §5.7) sont distinguées, et non fondues
  // dans un seul « cycle modifié » : annoncer « séance modifiée » quand elle a été SUPPRIMÉE
  // enverrait l'athlète chercher une séance qui n'existe plus.
  PLAN_UPDATED: "PLAN_UPDATED",
  PLAN_SESSION_ADDED: "PLAN_SESSION_ADDED",
  PLAN_SESSION_REMOVED: "PLAN_SESSION_REMOVED",
  FEEDBACK_RECEIVED: "FEEDBACK_RECEIVED",
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  INVOICE_ISSUED: "INVOICE_ISSUED",
  /**
   * Rappel du coach arrivé à échéance (#51). Le SEUL type qui n'existe pas dans l'enum Prisma : il
   * n'est jamais persisté, l'entrée est calculée à chaque lecture depuis la table `reminder`
   * (`reminderToNotificationDto`). Aucun push non plus — il n'y a pas de scheduler pour le déclencher
   * au bon moment (#47).
   */
  REMINDER_DUE: "REMINDER_DUE",
} as const;
export type NotificationType = TypesValuesOf<typeof NotificationType>;
export const notificationTypeSchema = z.enum(NotificationType);

/**
 * Les types réellement ÉCRITS en base — tous sauf `REMINDER_DUE`, qui est calculé à la lecture
 * depuis la table `reminder` et absent de l'enum Prisma.
 *
 * C'est ce type que `NotificationService` manipule à l'émission : le compilateur refuse donc de
 * persister un rappel dû par accident, plutôt que de laisser Prisma échouer à l'exécution. Le jour
 * où #47 voudra vraiment en persister un, il devra retirer l'exclusion ici ET ajouter la valeur à
 * l'enum Prisma — et choisir entre persister et calculer, jamais les deux.
 */
export type PersistedNotificationType = Exclude<
  NotificationType,
  typeof NotificationType.REMINDER_DUE
>;

/**
 * Les types qu'on peut recevoir **par e-mail** (#65) — un sous-ensemble volontairement court.
 *
 * Les trois ajustements d'un cycle diffusé (`PLAN_UPDATED`, `PLAN_SESSION_ADDED`,
 * `PLAN_SESSION_REMOVED`) en sont exclus : ils arrivent par RAFALES et rien ne les groupe encore
 * (dette N-6). Ajouter trois séances à un cycle produirait trois e-mails, ce qui vide une boîte de
 * sa valeur et nous fait classer indésirable. Ils restent servis par le push et par le centre, où
 * une rafale coûte une ligne et non un message. `REMINDER_DUE` en est absent pour une autre
 * raison : il n'est jamais persisté et ne passe pas par le point d'émission commun.
 *
 * C'est une LISTE et non un `Exclude<>` comme `PersistedNotificationType` : la frontière est un
 * choix produit révisable, pas une conséquence du modèle. Élargir se fait ici, et le catalogue de
 * gabarits (`Record<EmailableNotificationType, …>`) refuse alors de compiler tant que les textes
 * manquent.
 */
export const EMAILABLE_NOTIFICATION_TYPES = [
  NotificationType.PLAN_PUBLISHED,
  NotificationType.FEEDBACK_RECEIVED,
  NotificationType.MESSAGE_RECEIVED,
  NotificationType.INVOICE_ISSUED,
] as const satisfies readonly PersistedNotificationType[];

export type EmailableNotificationType = (typeof EMAILABLE_NOTIFICATION_TYPES)[number];
export const emailableNotificationTypeSchema = z.enum(EMAILABLE_NOTIFICATION_TYPES);

/**
 * Ce que la notification désigne, pour router à l'ouverture. Gardée explicite plutôt que dérivée du
 * `type`, en prévision des rappels — et c'est arrivé (#51) : `REMINDER_DUE` pointe vers un cycle OU
 * une facture, selon ce qu'on rappelle. Aucun `switch` sur le type n'aurait pu le deviner.
 */
export const NotificationEntityType = {
  PLAN: "PLAN",
  SCHEDULED_SESSION: "SCHEDULED_SESSION",
  CONVERSATION: "CONVERSATION",
  INVOICE: "INVOICE",
} as const;
export type NotificationEntityType = TypesValuesOf<typeof NotificationEntityType>;
export const notificationEntityTypeSchema = z.enum(NotificationEntityType);

/**
 * Clé i18n du libellé, par type. Le texte n'est ni stocké ni construit côté API : une notification
 * écrite aujourd'hui serait figée en français le jour où `en.json` arrive. On persiste donc les
 * PARAMÈTRES (`actorName`, `subjectLabel`) et le rendu se fait à l'affichage, dans la langue
 * courante. Même dispositif que `INVOICE_STATE_BADGE` — la table vit ici pour que web et mobile
 * ne réécrivent pas chacun le même `switch`.
 */
export const NOTIFICATION_LABEL_KEY = {
  [NotificationType.PLAN_PUBLISHED]: "notification.type.planPublished",
  [NotificationType.PLAN_UPDATED]: "notification.type.planUpdated",
  [NotificationType.PLAN_SESSION_ADDED]: "notification.type.planSessionAdded",
  [NotificationType.PLAN_SESSION_REMOVED]: "notification.type.planSessionRemoved",
  [NotificationType.FEEDBACK_RECEIVED]: "notification.type.feedbackReceived",
  [NotificationType.MESSAGE_RECEIVED]: "notification.type.messageReceived",
  [NotificationType.INVOICE_ISSUED]: "notification.type.invoiceIssued",
  [NotificationType.REMINDER_DUE]: "notification.type.reminderDue",
} as const satisfies Record<NotificationType, string>;

/**
 * Clé i18n du NOM d'un type, pour l'écran de réglages (#66).
 *
 * Table distincte de `NOTIFICATION_LABEL_KEY`, et ce n'est pas une duplication : celle-ci rend une
 * PHRASE d'événement, interpolée (« {{actor}} a débriefé « {{subject}} » »), qui n'a aucun sens à
 * côté d'un interrupteur. Ici il faut un nom de catégorie, sans paramètre — « Débrief reçu ».
 *
 * `Record<EmailableNotificationType, string>` : élargir la liste des types envoyables ne compile
 * plus tant que leur libellé de réglage manque.
 */
export const NOTIFICATION_SETTING_LABEL_KEY = {
  [NotificationType.PLAN_PUBLISHED]: "notification.setting.type.planPublished",
  [NotificationType.FEEDBACK_RECEIVED]: "notification.setting.type.feedbackReceived",
  [NotificationType.MESSAGE_RECEIVED]: "notification.setting.type.messageReceived",
  [NotificationType.INVOICE_ISSUED]: "notification.setting.type.invoiceIssued",
} as const satisfies Record<EmailableNotificationType, string>;

// Bornage de la liste : le centre montre les récentes, pas l'historique complet. Pas de pagination
// en première passe (dette assumée, même famille que les exercices P2-2 et les messages P5-1).
export const NOTIFICATION_PAGE_SIZE = 50;

export const notificationDtoSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  entityType: notificationEntityTypeSchema,
  entityId: z.string(),
  // Paramètres d'interpolation du libellé, jamais le texte rendu (cf. NOTIFICATION_LABEL_KEY).
  // `null` quand l'événement n'en a pas besoin — une facture émise n'a ni acteur ni sujet à
  // nommer. Ce sont des INSTANTANÉS : renommer un cycle ne réécrit pas l'historique.
  actorName: z.string().nullable(),
  subjectLabel: z.string().nullable(),
  /**
   * Le sujet exprimé comme **clé i18n** plutôt que comme valeur — pour les entrées dont le sujet
   * n'est pas du texte d'utilisateur mais un intitulé système (#47).
   *
   * Né du rappel AUTO-GÉNÉRÉ : il n'a pas de `note` (l'API n'en fabrique pas, cf. #48), seulement
   * un `reason`. Y mettre le libellé rendu aurait figé « la planification se termine » en français
   * dans une charge utile d'API — précisément la faute que `NOTIFICATION_LABEL_KEY` existe pour
   * empêcher. Une clé, elle, reste un PARAMÈTRE : le rendu se fait toujours côté client.
   *
   * `subjectLabel` reste la valeur à interpoler telle quelle (nom d'athlète, titre de cycle, note
   * du coach). Les deux ne coexistent pas sur une même entrée ; quand `subjectKey` est renseignée,
   * c'est elle qu'on traduit pour obtenir le sujet.
   */
  subjectKey: z.string().nullable(),
  // `null` = non lue. C'est ce qui alimente le badge.
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type NotificationDto = z.infer<typeof notificationDtoSchema>;

// Compteur servi à part de la liste : le badge se rafraîchit en continu, la liste seulement quand
// le panneau est ouvert.
/**
 * Le compteur du badge, VENTILÉ par espace (#176).
 *
 * `count` reste le total, et c'est lui que lit la cloche — pour un compte mono-capacité, rien ne
 * change. `coach` et `athlete` disent ce qui attend de chaque côté : c'est ce qui permet au
 * basculeur d'espace de signaler l'univers qu'on ne regarde pas (#129), sans quoi le mode
 * exclusif ferait manquer ce qui arrive ailleurs.
 *
 * `coach + athlete` peut être INFÉRIEUR à `count` : une notification dont le titre est indécidable
 * (un type inconnu d'une API plus récente) compte dans le total sans se ranger d'un côté. Mieux
 * vaut une pastille muette qu'une pastille menteuse.
 */
export const unreadCountDtoSchema = z.object({
  count: z.number().int().min(0),
  coach: z.number().int().min(0),
  athlete: z.number().int().min(0),
});
export type UnreadCountDto = z.infer<typeof unreadCountDtoSchema>;

/**
 * Réglage des notifications par e-mail d'un utilisateur (#65).
 *
 * La GRILLE COMPLÈTE est rendue, un `enabled` par type envoyable — jamais la seule liste des types
 * actifs. L'écran de réglages (#66) n'a ainsi rien à déduire d'une absence : il affiche ce qu'on
 * lui donne, dans l'ordre où on le lui donne, et un type ajouté côté API apparaît sans que le
 * client soit redéployé.
 */
export const notificationEmailPreferenceDtoSchema = z.object({
  type: emailableNotificationTypeSchema,
  enabled: z.boolean(),
});
export type NotificationEmailPreferenceDto = z.infer<typeof notificationEmailPreferenceDtoSchema>;

/**
 * Écriture : l'ENSEMBLE des types activés, pas une bascule.
 *
 * Remplacer l'ensemble rend l'écriture idempotente et sans état intermédiaire — deux bascules
 * envoyées en même temps depuis un écran ne peuvent pas s'écraser à moitié. Un type absent de la
 * liste est désactivé, ce qui est aussi la valeur par défaut : rejouer un `PUT` vide remet à zéro.
 */
export const updateNotificationEmailPreferencesSchema = z.object({
  enabled: z.array(emailableNotificationTypeSchema),
});
export type UpdateNotificationEmailPreferencesInput = z.infer<
  typeof updateNotificationEmailPreferencesSchema
>;
