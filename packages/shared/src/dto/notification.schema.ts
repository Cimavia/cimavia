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
  PLAN_UPDATED: "PLAN_UPDATED",
  FEEDBACK_RECEIVED: "FEEDBACK_RECEIVED",
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  INVOICE_ISSUED: "INVOICE_ISSUED",
} as const;
export type NotificationType = TypesValuesOf<typeof NotificationType>;
export const notificationTypeSchema = z.enum(NotificationType);

/**
 * Ce que la notification désigne, pour router à l'ouverture. Aujourd'hui dérivable du `type` — on
 * la garde explicite parce que les rappels (#51) casseront cette dérivation : un rappel dû porte
 * sur une facture OU une séance, selon ce qu'on rappelle.
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
  [NotificationType.FEEDBACK_RECEIVED]: "notification.type.feedbackReceived",
  [NotificationType.MESSAGE_RECEIVED]: "notification.type.messageReceived",
  [NotificationType.INVOICE_ISSUED]: "notification.type.invoiceIssued",
} as const satisfies Record<NotificationType, string>;

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
  // `null` = non lue. C'est ce qui alimente le badge.
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type NotificationDto = z.infer<typeof notificationDtoSchema>;

// Compteur servi à part de la liste : le badge se rafraîchit en continu, la liste seulement quand
// le panneau est ouvert.
export const unreadCountDtoSchema = z.object({ count: z.number().int().min(0) });
export type UnreadCountDto = z.infer<typeof unreadCountDtoSchema>;
