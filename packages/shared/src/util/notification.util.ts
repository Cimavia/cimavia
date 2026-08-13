import type { NotificationDto } from "../dto/notification.schema";

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
