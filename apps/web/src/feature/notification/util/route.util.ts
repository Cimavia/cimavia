import {
  type Capabilities,
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
  notificationOpeningCapability,
  type TrainingCapability,
} from "@cmv/shared";

/**
 * Chaque cible porte le `search` que sa route EXIGE — des clés requises mais possiblement
 * `undefined` : sous `exactOptionalPropertyTypes`, « absente » et « présente à undefined » ne sont
 * pas la même chose, et `<Link to="/planning">` seul ne compile pas.
 *
 * ⚠️ Rien ne le vérifie ICI. `navigate(target)` sur cette union échappe au contrôle de TanStack,
 * qui accepte alors une cible sans `search` : en #251, quatre des cinq routes qui en exigeaient un
 * n'en portaient aucun ici, sans que le typecheck bronche. Une route qui gagne un `validateSearch`
 * se reporte donc à la main — l'oubli ne se voit qu'en relisant la route.
 */
type NotificationTarget =
  | { to: "/plans/$planId"; params: { planId: string } }
  | { to: "/sessions/$sessionId"; params: { sessionId: string }; search: { from: undefined } }
  | { to: "/feedbacks"; search: { feedback: undefined; session: undefined } }
  | {
      to: "/messages";
      search: {
        athlete: undefined;
        coach: undefined;
        conversation: string;
        as: TrainingCapability | undefined;
        q: undefined;
      };
    }
  | { to: "/planning"; search: { from: undefined } }
  | {
      to: "/invoices";
      search: {
        as: TrainingCapability | undefined;
        q: undefined;
        situation: undefined;
        athlete: undefined;
      };
    }
  | { to: "/my-coach" }
  // Le tableau de suivi du coach, sans filtre (#123).
  | {
      to: "/";
      search: { q: undefined; filter: undefined; athlete: undefined };
    };

/** L'accueil du coach, sans filtre : ce que le tableau montre quand on n'a rien demandé. */
const COACH_HOME = {
  to: "/",
  search: { q: undefined, filter: undefined, athlete: undefined },
} as const satisfies NotificationTarget;

/**
 * Où mène une notification quand on clique dessus. Le web n'a pas (encore) d'écran par débrief ni
 * par fil : on ouvre la SECTION concernée, ce qui reste très au-dessus de « l'utilisateur cherche
 * lui-même ce dont on vient de lui parler ».
 *
 * **La destination dépend du TITRE sous lequel on l'ouvre**, et pas seulement de la cible. Les deux rôles reçoivent des
 * notifications sur les mêmes entités, mais ne disposent pas des mêmes écrans pour les lire : un
 * cycle diffusé mène le coach à son builder (`/plans/$planId`), route qu'un athlète ne peut pas
 * ouvrir — l'y envoyer le ferait rebondir sur son accueil, c'est-à-dire nulle part. Tant que la
 * route athlète n'existe pas, la bonne réponse est **`null`**, pas une destination approximative :
 * la cloche marque alors la notification lue et rafraîchit le cache sans naviguer, ce qui est
 * exactement ce qu'on veut dire (« il s'est passé quelque chose », sans mentir sur l'endroit).
 *
 * Chaque écran athlète-sur-web a branché sa destination en arrivant : `INVOICE` en premier (#27),
 * puis `PLAN` et `SCHEDULED_SESSION` avec le planning et le détail de séance (#25), enfin
 * `CONVERSATION` avec la messagerie (#29). Plus aucune cible ne mène nulle part pour un athlète.
 *
 * Ce titre est celui de la NOTIFICATION (`notificationOpeningCapability`, #344), pas celui qu'on
 * exerce ni toutes les capacités possédées : la cloche liste, mêlé, ce qu'un compte coach et athlète
 * reçoit des deux côtés — un cycle se lit en athlète, un débrief en coach, quel que soit l'espace
 * qu'on parcourt. `acting`, le titre exercé, ne départage que ce que le type laisse ouvert (un
 * message). Sur un compte qui cumule, le titre part aussi dans `?as=` des deux écrans servis aux
 * deux : une facture émise ouverte depuis l'espace coach montre celles de l'athlète.
 *
 * `null` aussi sur un type inconnu — une version d'app plus ancienne que l'API ne doit pas deviner.
 */
export function routeForNotification(
  notification: NotificationDto,
  capabilities: Capabilities,
  acting: TrainingCapability,
): NotificationTarget | null {
  /**
   * Une invitation REFUSÉE ne mène nulle part, et c'est décidé AVANT la table — le seul type dont
   * la destination soit supprimée plutôt que déduite.
   *
   * À ne pas confondre avec le repli de `REMINDER_DUE` côté mobile (#46), qui en est l'exact
   * inverse : là-bas le type COMBLE une destination absente, ici il en RETIRE une qui existe. La
   * raison n'est pas que l'écran manque — il est là, c'est le panneau d'invitations du coach —
   * mais que l'ENTITÉ est morte : l'invitation refusée a quitté `PENDING`, et le coach y
   * chercherait une ligne qui n'y est plus.
   */
  if (notification.type === NotificationType.INVITATION_DECLINED) return null;

  const capability = notificationOpeningCapability(notification.type, capabilities, acting);
  // Le compte n'a plus la capacité sous laquelle il l'a reçue : aucun de ses écrans ne la montre.
  if (capability == null) return null;
  const isCoach = capability === "coach";
  // L'URL reste nue pour un compte mono-capacité : la question du titre ne se pose pas (#129).
  const as = capabilities.isCoach && capabilities.isAthlete ? capability : undefined;

  switch (notification.entityType) {
    /**
     * Le coach va à SON builder, l'athlète à SON planning. Pas de lien fin vers la semaine
     * concernée côté athlète : `entityId` est le cycle, pas la semaine, et un cycle en compte
     * plusieurs. Conséquence assumée — « une séance a été ajoutée » ouvre le planning sur son
     * DÉFAUT (`from` absent) : la semaine d'aujourd'hui quand un cycle a cours, le début du cycle
     * servi sinon (#240). Pas forcément celle où la séance a atterri, mais mieux vaut le planning
     * que rien.
     */
    case NotificationEntityType.PLAN:
      return isCoach
        ? { to: "/plans/$planId", params: { planId: notification.entityId } }
        : { to: "/planning", search: { from: undefined } };
    /**
     * Ce type n'est émis QU'AU COACH aujourd'hui (`FEEDBACK_RECEIVED`), et le web n'a pas d'écran
     * par débrief : on ouvre la section. La branche athlète est écrite quand même, comme sur
     * mobile — cette table décrit où vit une cible pour une capacité, pas quelles notifications
     * existent, et la destination existe désormais (#25).
     *
     * Côté athlète, aucune semaine de planning n'accompagne la séance : on n'arrive pas du planning,
     * et « Mon planning » rouvrira donc son défaut (#251).
     */
    case NotificationEntityType.SCHEDULED_SESSION:
      return isCoach
        ? { to: "/feedbacks", search: { feedback: undefined, session: undefined } }
        : {
            to: "/sessions/$sessionId",
            params: { sessionId: notification.entityId },
            search: { from: undefined },
          };
    // Servie aux deux rôles depuis #29 : même route, contenu décidé par l'écran. La notification
    // ne connaît que le fil ; c'est l'écran qui le traduit en interlocuteur — un athlète suivi par
    // plusieurs coachs doit tomber sur le fil de celui qui a écrit (#599).
    case NotificationEntityType.CONVERSATION:
      return {
        to: "/messages",
        search: {
          athlete: undefined,
          coach: undefined,
          conversation: notification.entityId,
          as,
          q: undefined,
        },
      };
    // Servie aux deux rôles depuis #27 : même route, contenu scopé par le tenant.
    case NotificationEntityType.INVOICE:
      return {
        to: "/invoices",
        search: { as, q: undefined, situation: undefined, athlete: undefined },
      };
    /**
     * L'invitation (#146) se branche par CAPACITÉ comme tout le reste de cette table, et les deux
     * destinations tombent sans une seule ligne de branchement sur le type : le coach va voir le
     * nouvel athlète apparaître dans son tableau de suivi — c'est ce qu'on vient de lui annoncer —
     * et l'athlète va à l'écran où l'invitation s'accepte.
     *
     * L'invitation d'une entreprise tombe dans la même branche : celle d'un Coach (#601) attend sur
     * son tableau de bord, celle d'un athlète (#602) dans « Mes coachs », comme l'arrivée d'un Coach
     * de l'entreprise qui le suit désormais. Sur un compte à double capacité, c'est le type qui
     * tranche (#344) : l'invitation reçue se lit en athlète, la réponse en coach.
     */
    case NotificationEntityType.INVITATION:
      return isCoach ? COACH_HOME : { to: "/my-coach" };
    default:
      return null;
  }
}
