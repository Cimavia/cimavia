import { type NotificationDto, NotificationEntityType } from "@cmv/shared";

type NotificationTarget =
  | { to: "/plans/$planId"; params: { planId: string } }
  | { to: "/feedbacks" }
  | { to: "/messages" }
  | { to: "/invoices" };

/**
 * Où mène une notification quand on clique dessus. Le web n'a pas (encore) d'écran par débrief ni
 * par fil : on ouvre la SECTION concernée, ce qui reste très au-dessus de « l'utilisateur cherche
 * lui-même ce dont on vient de lui parler ». Le deep-link fin suivra les écrans athlète-sur-web
 * (#25–#29), qui introduiront les routes manquantes.
 *
 * `null` sur un type inconnu — une version d'app plus ancienne que l'API ne doit pas deviner.
 */
export function routeForNotification(notification: NotificationDto): NotificationTarget | null {
  switch (notification.entityType) {
    case NotificationEntityType.PLAN:
      return { to: "/plans/$planId", params: { planId: notification.entityId } };
    case NotificationEntityType.SCHEDULED_SESSION:
      return { to: "/feedbacks" };
    case NotificationEntityType.CONVERSATION:
      return { to: "/messages" };
    case NotificationEntityType.INVOICE:
      return { to: "/invoices" };
    default:
      return null;
  }
}
