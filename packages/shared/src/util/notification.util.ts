import { type Capabilities, hasCapability, type TrainingCapability } from "../capability";
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_CATEGORY_LABEL_KEY,
  NotificationCategory,
  type NotificationDto,
  NotificationType,
} from "../dto/notification.schema";

/**
 * Les types dont `subjectLabel` porte une DATE CIVILE et non un libellé (#148).
 *
 * L'API persiste la donnée (`2026-09-07`) et jamais sa mise en forme, pour la raison qui vaut
 * déjà pour les libellés : une notification écrite aujourd'hui serait figée en français le jour où
 * `en.json` arrive. C'est donc ici, à l'affichage, que la date devient lisible.
 */
const DATE_SUBJECT_TYPES: ReadonlySet<NotificationType> = new Set([
  NotificationType.PLAN_SESSIONS_REORDERED,
]);

/**
 * Le SUJET d'une entrée du centre, résolu — la valeur à interpoler dans
 * `NOTIFICATION_LABEL_KEY[type]`.
 *
 * Trois sources, dans cet ordre :
 *
 * 1. **`subjectKey`** — un intitulé SYSTÈME, transporté comme clé i18n et traduit ici. Né du rappel
 *    auto-généré (#47), qui n'a pas de note : l'API ne fabrique pas de libellé, elle persiste le
 *    motif (règle de #48).
 * 2. **`subjectLabel`** — une VALEUR d'utilisateur (nom d'athlète, titre de cycle, note du coach),
 *    affichée telle quelle. C'est un instantané : renommer un cycle ne réécrit pas l'historique.
 * 3. **une DATE**, quand le type le dit (`DATE_SUBJECT_TYPES`) : la valeur est une date civile ISO,
 *    mise en forme dans la langue courante plutôt qu'affichée brute.
 *
 * `null` quand l'événement n'a pas de sujet à nommer (une facture émise, par exemple) — à charge du
 * client d'afficher « — ». Jamais une chaîne vide, qui laisserait un trou dans la phrase.
 *
 * Le traducteur est INJECTÉ plutôt qu'importé : `@cmv/shared` ne connaît pas i18next, et chaque app
 * a son instance. Même dispositif que `formatRelativeOrDateTime`.
 *
 * `formatFullDay` l'est pour la raison JUMELLE : chaque app tient déjà un formateur branché sur sa
 * locale (`createFormatters`, #137). Prendre une `locale` ici rouvrirait le point d'injection que
 * cette fabrique a fermé, et ferait diverger la date d'une notification de celle du reste de
 * l'écran.
 */
export function notificationSubject(
  notification: Pick<NotificationDto, "type" | "subjectLabel" | "subjectKey">,
  translate: (key: string) => string,
  formatFullDay: (isoDate: string) => string,
): string | null {
  if (notification.subjectKey != null) return translate(notification.subjectKey);
  if (notification.subjectLabel == null) return null;
  if (!DATE_SUBJECT_TYPES.has(notification.type)) return notification.subjectLabel;
  return formatFullDay(notification.subjectLabel);
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
export function capabilityOfNotification(type: NotificationType): TrainingCapability | null {
  switch (type) {
    // Tout ce qui concerne un cycle est reçu par celui qui s'entraîne dessus.
    case NotificationType.PLAN_PUBLISHED:
    case NotificationType.PLAN_UPDATED:
    case NotificationType.PLAN_SESSION_ADDED:
    case NotificationType.PLAN_SESSION_REMOVED:
    case NotificationType.PLAN_SESSIONS_REORDERED:
    case NotificationType.INVOICE_ISSUED:
    // Une invitation qui attend se lit forcément en athlète : c'est la capacité qu'elle propose
    // d'exercer, et la seule qui puisse l'accepter.
    case NotificationType.INVITATION_RECEIVED:
    // Le Coach qui rejoint une entreprise (#602) suit désormais l'athlète : c'est lui qu'on prévient.
    case NotificationType.ORGANIZATION_COACH_JOINED:
      return "athlete";
    // Le débrief est écrit par l'athlète et lu par son coach ; le rappel est un outil du coach.
    case NotificationType.FEEDBACK_RECEIVED:
    case NotificationType.REMINDER_DUE:
    // Les deux réponses à une invitation reviennent à celui qui l'a émise, donc au coach.
    case NotificationType.INVITATION_ACCEPTED:
    case NotificationType.INVITATION_DECLINED:
    // L'invitation d'une entreprise ne s'accepte qu'en Coach (#601).
    case NotificationType.ORGANIZATION_INVITATION_RECEIVED:
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
 * Sous quel titre OUVRIR une notification (#344) — ce qui décide où elle mène, et quel côté les
 * écrans partagés (factures, messagerie) montrent en arrivant.
 *
 * Le titre de la notification d'abord, pas celui qu'on exerce : le centre n'est PAS filtré par
 * espace, il liste tout ce que le compte a reçu. Router un « débrief reçu » sous le titre athlète
 * qu'on exerce mènerait à la séance de SON athlète par une route d'athlète — un 403. Le titre
 * exercé ne départage que le message, que les deux côtés d'un fil reçoivent.
 *
 * `null` dans deux cas, et l'appelant ne navigue pas :
 * - le compte n'a plus la capacité sous laquelle il l'a reçue (un Coach qui a cessé de coacher
 *   relit un vieux débrief) : aucun de ses écrans ne la montre, mieux vaut rester que viser un 403 ;
 * - le type est inconnu (API plus récente que ce client) : fail closed, comme
 *   `capabilityOfNotification` — un client ne devine pas le titre d'un type qu'il ignore. La cloche
 *   et le push s'accordent ainsi : le push ne sait pas lire les clés d'id d'un type inconnu.
 */
export function notificationOpeningCapability(
  type: NotificationType,
  capabilities: Capabilities,
  acting: TrainingCapability,
): TrainingCapability | null {
  const received = capabilityOfNotification(type);
  if (received != null) return hasCapability(capabilities, received) ? received : null;
  return type === NotificationType.MESSAGE_RECEIVED ? acting : null;
}

/**
 * Le titre auquel un message est reçu : coach si le destinataire est le coach du fil, athlète
 * sinon. La conversation est la seule à porter l'information — d'où ce second temps.
 */
export function capabilityOfMessage(
  recipientId: string,
  conversation: { coachId: string; athleteId: string },
): TrainingCapability {
  return conversation.coachId === recipientId ? "coach" : "athlete";
}

// L'inverse de `NOTIFICATION_CATEGORY`, calculé une fois au chargement : la cloche le lit à chaque
// rendu, l'API à chaque requête. Le `Record` refuse une catégorie oubliée ici.
const TYPES_BY_CATEGORY: Record<NotificationCategory, NotificationType[]> = {
  [NotificationCategory.PLANNING]: [],
  [NotificationCategory.FEEDBACK]: [],
  [NotificationCategory.MESSAGE]: [],
  [NotificationCategory.BILLING]: [],
  [NotificationCategory.INVITATION]: [],
  [NotificationCategory.REMINDER]: [],
};
for (const type of Object.values(NotificationType)) {
  TYPES_BY_CATEGORY[NOTIFICATION_CATEGORY[type]].push(type);
}

/**
 * Les types d'une catégorie (#694), dans l'ordre de l'enum — ce que l'API filtre.
 *
 * Lue depuis `NOTIFICATION_CATEGORY` plutôt qu'écrite à part : deux tables diraient un jour deux
 * choses différentes. `REMINDER_DUE` y figure comme les autres ; c'est à l'API d'écarter ce qu'elle
 * ne persiste pas.
 */
export function notificationTypesOf(category: NotificationCategory): readonly NotificationType[] {
  return TYPES_BY_CATEGORY[category];
}

/**
 * Les catégories que ce compte peut RECEVOIR, dans l'ordre des pastilles (#694) : un athlète seul
 * n'a pas à voir « Débriefs » ni « Rappels », un Coach seul pas « Facturation ».
 *
 * Dérivée de `capabilityOfNotification`, qui dit déjà sous quel titre chaque type se lit : une
 * catégorie est offerte dès qu'UN de ses types l'est. Le type sans titre (`MESSAGE_RECEIVED`) se
 * reçoit des deux côtés, donc par tout compte qui coache ou s'entraîne. Un compte Entreprise, qui ne
 * fait ni l'un ni l'autre, n'a aucune catégorie.
 */
export function notificationCategoriesFor(capabilities: Capabilities): NotificationCategory[] {
  const trains = capabilities.isCoach || capabilities.isAthlete;
  const receives = (type: NotificationType): boolean => {
    const capability = capabilityOfNotification(type);
    return capability == null ? trains : hasCapability(capabilities, capability);
  };
  return Object.values(NotificationCategory).filter((category) =>
    notificationTypesOf(category).some(receives),
  );
}

/** Une pastille du filtre : sa catégorie (`null` = « Toutes ») et la clé i18n de son libellé. */
export type NotificationFilterChoice = {
  category: NotificationCategory | null;
  labelKey: string;
};

/**
 * Les pastilles du filtre, dans l'ordre (#694) : « Toutes », puis chaque catégorie que le compte
 * reçoit. La règle vit ici pour que le web et le mobile ne la réécrivent pas chacun.
 *
 * Vide sous deux catégories : une seule n'a rien à filtrer, « Toutes » la montre déjà — et un
 * compte Entreprise n'en a aucune. Le client ne dessine alors pas de rangée.
 */
export function notificationFilterChoices(capabilities: Capabilities): NotificationFilterChoice[] {
  const categories = notificationCategoriesFor(capabilities);
  if (categories.length < 2) return [];
  return [
    { category: null, labelKey: "notification.category.all" },
    ...categories.map((category) => ({
      category,
      labelKey: NOTIFICATION_CATEGORY_LABEL_KEY[category],
    })),
  ];
}
