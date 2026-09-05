import type { CapabilityName } from "../capability";
import { type NotificationDto, NotificationType } from "../dto/notification.schema";

/**
 * Le SUJET d'une entrée du centre, résolu — la valeur à interpoler dans
 * `NOTIFICATION_LABEL_KEY[type]`.
 *
 * Deux sources, dans cet ordre :
 *
 * 1. **`subjectKey`** — un intitulé SYSTÈME, transporté comme clé i18n et traduit ici. Né du rappel
 *    auto-généré (#47), qui n'a pas de note : l'API ne fabrique pas de libellé, elle persiste le
 *    motif (règle de #48).
 * 2. **`subjectLabel`** — une VALEUR d'utilisateur (nom d'athlète, titre de cycle, note du coach),
 *    affichée telle quelle. C'est un instantané : renommer un cycle ne réécrit pas l'historique.
 *
 * `null` quand l'événement n'a pas de sujet à nommer (une facture émise, par exemple) — à charge du
 * client d'afficher « — ». Jamais une chaîne vide, qui laisserait un trou dans la phrase.
 *
 * Le traducteur est INJECTÉ plutôt qu'importé : `@cmv/shared` ne connaît pas i18next, et chaque app
 * a son instance. Même dispositif que `formatRelativeOrDateTime`.
 */
export function notificationSubject(
  notification: Pick<NotificationDto, "subjectLabel" | "subjectKey">,
  translate: (key: string) => string,
): string | null {
  if (notification.subjectKey != null) return translate(notification.subjectKey);
  return notification.subjectLabel;
}

/**
 * À quel TITRE une notification est reçue — la capacité sous laquelle son destinataire la lit
 * (#176).
 *
 * C'est ce qui permet à un compte à double capacité de savoir qu'un débrief l'attend côté coach
 * pendant qu'il consulte son planning d'athlète. Rien en base ne le dit : `Notification` porte un
 * destinataire, pas un titre. On le dérive donc du TYPE, qui détermine à lui seul de quel côté de
 * la relation on se trouve — un cycle diffusé se reçoit en athlète, un débrief en coach.
 *
 * `null` pour `MESSAGE_RECEIVED`, seul type ambigu : les deux côtés d'un fil en reçoivent, et
 * seule la conversation dirait lequel. Le résoudre demanderait de charger chaque fil cité —
 * l'appelant le fait s'il en a besoin, plutôt que de le supposer ici (`capabilityOfMessage`).
 */
export function capabilityOfNotification(type: NotificationType): CapabilityName | null {
  switch (type) {
    // Tout ce qui concerne un cycle est reçu par celui qui s'entraîne dessus.
    case NotificationType.PLAN_PUBLISHED:
    case NotificationType.PLAN_UPDATED:
    case NotificationType.PLAN_SESSION_ADDED:
    case NotificationType.PLAN_SESSION_REMOVED:
    case NotificationType.INVOICE_ISSUED:
    // Une invitation qui attend se lit forcément en athlète : c'est la capacité qu'elle propose
    // d'exercer, et la seule qui puisse l'accepter.
    case NotificationType.INVITATION_RECEIVED:
      return "athlete";
    // Le débrief est écrit par l'athlète et lu par son coach ; le rappel est un outil du coach.
    case NotificationType.FEEDBACK_RECEIVED:
    case NotificationType.REMINDER_DUE:
    // Les deux réponses à une invitation reviennent à celui qui l'a émise, donc au coach.
    case NotificationType.INVITATION_ACCEPTED:
    case NotificationType.INVITATION_DECLINED:
      return "coach";
    case NotificationType.MESSAGE_RECEIVED:
      return null;
    default:
      // Fail closed : un type qu'on ne connaît pas (API plus récente que ce client) ne se range
      // dans aucun espace plutôt que d'être compté du mauvais côté.
      return null;
  }
}

/**
 * Le titre auquel un message est reçu : coach si le destinataire est le coach du fil, athlète
 * sinon. La conversation est la seule à porter l'information — d'où ce second temps.
 */
export function capabilityOfMessage(
  recipientId: string,
  conversation: { coachId: string; athleteId: string },
): CapabilityName {
  return conversation.coachId === recipientId ? "coach" : "athlete";
}
