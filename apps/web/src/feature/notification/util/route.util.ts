import { type Capabilities, type NotificationDto, NotificationEntityType } from "@cmv/shared";

type NotificationTarget =
  | { to: "/plans/$planId"; params: { planId: string } }
  | { to: "/feedbacks" }
  | { to: "/messages" }
  | { to: "/invoices" };

/**
 * Où mène une notification quand on clique dessus. Le web n'a pas (encore) d'écran par débrief ni
 * par fil : on ouvre la SECTION concernée, ce qui reste très au-dessus de « l'utilisateur cherche
 * lui-même ce dont on vient de lui parler ».
 *
 * **La destination dépend de la CAPACITÉ**, et pas seulement du type. Les deux rôles reçoivent des
 * notifications sur les mêmes entités, mais ne disposent pas des mêmes écrans pour les lire : un
 * cycle diffusé mène le coach à son builder (`/plans/$planId`), route qu'un athlète ne peut pas
 * ouvrir — l'y envoyer le ferait rebondir sur son accueil, c'est-à-dire nulle part. Tant que la
 * route athlète n'existe pas, la bonne réponse est **`null`**, pas une destination approximative :
 * la cloche marque alors la notification lue et rafraîchit le cache sans naviguer, ce qui est
 * exactement ce qu'on veut dire (« il s'est passé quelque chose », sans mentir sur l'endroit).
 *
 * Chaque écran athlète-sur-web branche sa destination en arrivant : #25 pour `PLAN` et
 * `SCHEDULED_SESSION`, #29 pour `CONVERSATION`. `INVOICE` est le premier à être servi des deux
 * côtés (#27).
 *
 * Limite connue, laissée à #7 : une notification ne dit pas **à quel titre** on la reçoit. Sur un
 * compte à double capacité, un cycle diffusé « en tant qu'athlète » mènera quand même au builder.
 *
 * `null` aussi sur un type inconnu — une version d'app plus ancienne que l'API ne doit pas deviner.
 */
export function routeForNotification(
  notification: NotificationDto,
  capabilities: Capabilities,
): NotificationTarget | null {
  const { isCoach } = capabilities;

  switch (notification.entityType) {
    case NotificationEntityType.PLAN:
      return isCoach ? { to: "/plans/$planId", params: { planId: notification.entityId } } : null;
    case NotificationEntityType.SCHEDULED_SESSION:
      return isCoach ? { to: "/feedbacks" } : null;
    case NotificationEntityType.CONVERSATION:
      return isCoach ? { to: "/messages" } : null;
    // Servie aux deux rôles depuis #27 : même route, contenu scopé par le tenant.
    case NotificationEntityType.INVOICE:
      return { to: "/invoices" };
    default:
      return null;
  }
}
