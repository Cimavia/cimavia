import {
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
} from "../dto/notification.schema";
import { type ReminderDto, type ReminderEntityType, ReminderStatus } from "../dto/reminder.schema";

// Ce dont dépend l'échéance d'un rappel, et rien de plus (même forme structurelle qu'`InvoiceTiming`
// pour `resolveInvoiceState`) : la fonction accepte donc aussi bien un `ReminderDto` qu'une ligne.
export type ReminderTiming = { dueAt: string; status: ReminderStatus };

/**
 * Un rappel est-il **dû** ? C'est la seule dérivation temporelle de la feature, et les clients s'en
 * servent pour distinguer « en retard » de « à venir » dans la liste des rappels.
 *
 * L'API applique la MÊME règle, mais en SQL (`dueAt: { lte: now }`, cf. `ReminderService.listDue`) :
 * charger tous les rappels PENDING pour en filtrer trois en mémoire renoncerait à l'index. Les deux
 * moitiés doivent donc s'accorder sur une borne **inclusive** — c'est ce que fixent le test ci-contre
 * et l'e2e du centre de notifications, chacun de son côté.
 *
 * Calculé à la LECTURE, jamais persisté ni poussé : aucun job en arrière-plan n'existe tant que
 * #47 n'a pas atterri. Conséquence assumée — un rappel qui devient dû n'émet aucun push, il
 * apparaît au prochain chargement.
 *
 * Un rappel DONE ou DISMISSED n'est jamais dû, quelle que soit son échéance : le temps ne rouvre
 * pas ce qui a été traité (même règle que `resolveInvoiceState` sur une facture payée).
 *
 * Contrairement au reste du fichier de formatage, `dueAt` est comparé comme un **instant** (et non
 * comme une date civile) : un rappel se déclenche à une heure. Une valeur illisible rend `false` —
 * une donnée corrompue ne doit pas fabriquer une alerte. Le schéma Zod (`z.iso.datetime()`) est ce
 * qui garantit en amont qu'on n'y arrive pas.
 */
export function isReminderDue(reminder: ReminderTiming, now: Date): boolean {
  if (reminder.status !== ReminderStatus.PENDING) return false;
  const dueAt = Date.parse(reminder.dueAt);
  if (Number.isNaN(dueAt)) return false;
  return dueAt <= now.getTime();
}

// ── Rappel dû → entrée du centre de notifications (#51) ──────────────────────

/**
 * Vers quel écran mène un rappel dû qu'on ouvre depuis le centre. C'est la TABLE annoncée par
 * `ReminderEntityType` : le pont entre « ce qu'on peut rappeler » et « ce vers quoi une notification
 * pointe », plutôt qu'une fonte des deux enums.
 *
 * Écrite comme une table et non comme un `switch` (idiome de `NOTIFICATION_LABEL_KEY` et
 * d'`INVOICE_STATE_BADGE`) : le `satisfies Record<…>` fait échouer le typecheck le jour où une
 * valeur est ajoutée à `ReminderEntityType` sans destination. Un `switch` avec `default` aurait, lui,
 * silencieusement cessé de router.
 *
 * Conséquence heureuse : `routeForNotification`, des deux côtés, n'a pas une ligne à changer — il
 * lit `entityType`, qui vaut déjà PLAN ou INVOICE.
 */
export const REMINDER_TARGET_ENTITY_TYPE = {
  PLAN: NotificationEntityType.PLAN,
  INVOICE: NotificationEntityType.INVOICE,
} as const satisfies Record<ReminderEntityType, NotificationEntityType>;

/**
 * Préfixe des id d'entrées de flux adossées à un rappel.
 *
 * `NotificationDto.id` devient donc un id d'**entrée de flux**, pas un id de table : le centre
 * mélange deux sources (des lignes `notification`, et des rappels dus calculés à la lecture). Le
 * préfixe est ce qui permet à `PATCH /me/notifications/:id/read` de rester UNE route, et aux deux
 * UI de ne rien savoir de tout ça — sans lui, il aurait fallu un second endpoint, deux hooks et
 * deux chemins de clic à garder en phase.
 */
export const REMINDER_FEED_ID_PREFIX = "reminder:";

export function toReminderFeedId(reminderId: string): string {
  return `${REMINDER_FEED_ID_PREFIX}${reminderId}`;
}

/**
 * L'id de rappel porté par un id d'entrée de flux, ou `null` si l'entrée n'en est pas une (une
 * notification persistée ordinaire). C'est ce `null` qui aiguille le marquage « lu » vers la bonne
 * table.
 *
 * Un préfixe sans id derrière rend `null` : `"reminder:"` n'est pas un identifiant, et le laisser
 * passer produirait une requête sur la chaîne vide.
 */
export function parseReminderFeedId(feedId: string): string | null {
  if (!feedId.startsWith(REMINDER_FEED_ID_PREFIX)) return null;
  const reminderId = feedId.slice(REMINDER_FEED_ID_PREFIX.length);
  return reminderId.length === 0 ? null : reminderId;
}

// Ce dont une entrée de flux a besoin, et rien de plus : ni `targetLabel` (le centre affiche la
// note, pas le nom de la cible), ni `status` (seuls les rappels dus arrivent ici). Le service API
// évite ainsi de résoudre les libellés de cible pour rien. Un `ReminderDto` complet convient aussi.
export type ReminderFeedSource = Pick<
  ReminderDto,
  "id" | "entityType" | "entityId" | "note" | "readAt" | "dueAt"
>;

/**
 * Un rappel dû, vu comme une entrée du centre de notifications (#51).
 *
 * Trois choix se lisent ici :
 *
 * 1. **`createdAt` vaut `dueAt`.** Le centre trie par `createdAt` décroissant : un rappel « arrive »
 *    au moment où il devient dû, pas au moment où il a été créé. Sinon un rappel posé en janvier
 *    pour mars se rangerait en janvier, sous six semaines de notifications, et personne ne le
 *    verrait le jour où il compte.
 * 2. **`subjectLabel` vaut la note**, et `actorName` est `null` : un rappel n'a pas d'acteur, le
 *    coach se le rappelle à lui-même. La note est du texte du coach, donc affichable telle quelle —
 *    le libellé, lui, reste rendu côté client (`NOTIFICATION_LABEL_KEY[REMINDER_DUE]`), comme pour
 *    tout le reste du centre.
 * 3. **Aucune ligne `notification` n'est écrite.** L'entrée est CALCULÉE à chaque lecture — c'est
 *    pourquoi `REMINDER_DUE` n'existe pas dans l'enum Prisma : la base ne peut pas le stocker, et
 *    c'est volontaire. Le jour où #47 poussera un rappel dû, il faudra choisir entre persister et
 *    calculer, jamais les deux — sinon le même rappel apparaîtrait en double.
 */
export function reminderToNotificationDto(reminder: ReminderFeedSource): NotificationDto {
  return {
    id: toReminderFeedId(reminder.id),
    type: NotificationType.REMINDER_DUE,
    entityType: REMINDER_TARGET_ENTITY_TYPE[reminder.entityType],
    entityId: reminder.entityId,
    actorName: null,
    subjectLabel: reminder.note,
    readAt: reminder.readAt,
    createdAt: reminder.dueAt,
  };
}
