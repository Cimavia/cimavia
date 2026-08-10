import { type Capabilities, type NotificationDto, NotificationEntityType } from "@cmv/shared";

type NotificationTarget =
  | { to: "/plans/$planId"; params: { planId: string } }
  | { to: "/sessions/$sessionId"; params: { sessionId: string } }
  | { to: "/feedbacks" }
  | { to: "/messages" }
  | { to: "/planning" }
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
 * Chaque écran athlète-sur-web branche sa destination en arrivant. `INVOICE` a été le premier servi
 * des deux côtés (#27), `PLAN` et `SCHEDULED_SESSION` ont suivi avec le planning et le détail de
 * séance (#25). Il ne reste que `CONVERSATION`, qui attend #29 — et son `null` n'est pas un oubli :
 * l'athlète n'a pas encore d'écran de messagerie sur web.
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
    /**
     * Le coach va à SON builder, l'athlète à SON planning. Pas de lien fin vers la semaine
     * concernée côté athlète : `entityId` est le cycle, pas la semaine, et il n'a de toute façon
     * qu'un cycle courant. Conséquence assumée — « une séance a été ajoutée » ouvre la semaine
     * courante, qui n'est pas forcément celle où la séance a atterri. Mieux vaut le planning que
     * rien.
     */
    case NotificationEntityType.PLAN:
      return isCoach
        ? { to: "/plans/$planId", params: { planId: notification.entityId } }
        : { to: "/planning" };
    /**
     * Ce type n'est émis QU'AU COACH aujourd'hui (`FEEDBACK_RECEIVED`), et le web n'a pas d'écran
     * par débrief : on ouvre la section. La branche athlète est écrite quand même, comme sur
     * mobile — cette table décrit où vit une cible pour une capacité, pas quelles notifications
     * existent, et la destination existe désormais (#25).
     */
    case NotificationEntityType.SCHEDULED_SESSION:
      return isCoach
        ? { to: "/feedbacks" }
        : { to: "/sessions/$sessionId", params: { sessionId: notification.entityId } };
    case NotificationEntityType.CONVERSATION:
      return isCoach ? { to: "/messages" } : null;
    // Servie aux deux rôles depuis #27 : même route, contenu scopé par le tenant.
    case NotificationEntityType.INVOICE:
      return { to: "/invoices" };
    default:
      return null;
  }
}
