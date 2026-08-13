import {
  type NotificationDto,
  NotificationEntityType,
  NotificationType,
} from "../dto/notification.schema";
import {
  type ReminderDto,
  type ReminderEntityType,
  type ReminderReason,
  ReminderStatus,
} from "../dto/reminder.schema";

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

// ── Rendu d'un rappel, partagé web ↔ mobile ─────────────────────────────────

/**
 * Pastille d'état d'un rappel : variant + clé i18n, sur le modèle exact d'`INVOICE_STATE_BADGE`.
 *
 * `OVERDUE` n'est **pas** un statut stocké — c'est un rappel `PENDING` dont l'échéance est passée
 * (`isReminderDue`, ci-dessus). Même dispositif que les factures, où « en retard » est dérivé : la
 * table décrit quatre états d'AFFICHAGE là où l'enum n'en stocke que trois.
 *
 * Promue ici en #46, conformément à la règle (2+ apps → package) : elle a vécu dans
 * `apps/web/src/feature/reminder/` tant que le web était le seul à la rendre. L'écran mobile est le
 * second client, et deux `switch` parallèles auraient divergé au premier ajout d'état.
 */
export type ReminderStateBadge = {
  variant: "success" | "warning" | "error" | "neutral";
  labelKey: string;
};

export const REMINDER_BADGE = {
  OVERDUE: { variant: "error", labelKey: "reminder.state.overdue" },
  [ReminderStatus.PENDING]: { variant: "warning", labelKey: "reminder.state.pending" },
  [ReminderStatus.DONE]: { variant: "success", labelKey: "reminder.state.done" },
  [ReminderStatus.DISMISSED]: { variant: "neutral", labelKey: "reminder.state.dismissed" },
} as const satisfies Record<ReminderStatus | "OVERDUE", ReminderStateBadge>;

/**
 * L'état d'AFFICHAGE d'un rappel : son statut, sauf s'il est dû — auquel cas « en retard » prime.
 *
 * Extrait des deux clients plutôt que recopié : chacun calculait `isReminderDue(...) ? "OVERDUE" :
 * status` avant d'indexer la table, ce qui est la dérivation elle-même, pas du rendu.
 */
export function reminderBadgeState(
  reminder: ReminderTiming,
  now: Date,
): keyof typeof REMINDER_BADGE {
  return isReminderDue(reminder, now) ? "OVERDUE" : reminder.status;
}

/**
 * Clé i18n du libellé d'un rappel AUTO-GÉNÉRÉ, par motif (#47). Strict pendant de
 * `NOTIFICATION_LABEL_KEY`, et pour la même raison : l'API persiste le motif, jamais son libellé —
 * sans quoi un rappel généré aujourd'hui resterait en français le jour où `en.json` arrive.
 */
export const REMINDER_REASON_KEY = {
  PLAN_ENDING: "reminder.reason.planEnding",
  INVOICE_OVERDUE: "reminder.reason.invoiceOverdue",
} as const satisfies Record<ReminderReason, string>;

/**
 * Ce qu'une ligne de rappel affiche comme titre, sous forme de **clé i18n ou de texte brut** —
 * jamais rendu ici, `@cmv/shared` n'a pas de traducteur.
 *
 * La note l'emporte sur le motif : un rappel généré auquel le coach a ajouté une note (#105) doit
 * montrer SA phrase, pas l'intitulé système qui l'a fait naître. Les deux champs ne s'excluent donc
 * pas, ils se classent.
 *
 * `null`/`null` ne devrait pas arriver (l'API garantit qu'au moins l'un des deux existe) — on rend
 * alors `null` plutôt qu'une chaîne vide, à charge pour le client d'afficher « — ». Pas de repli
 * silencieux.
 */
export type ReminderLabel = { kind: "text"; value: string } | { kind: "key"; value: string };

export function reminderLabel(
  reminder: Pick<ReminderDto, "note" | "reason">,
): ReminderLabel | null {
  if (reminder.note != null) return { kind: "text", value: reminder.note };
  if (reminder.reason != null) return { kind: "key", value: REMINDER_REASON_KEY[reminder.reason] };
  return null;
}

/**
 * Clé i18n du type de cible, pour composer « Cycle — … » / « Facture — mars 2026 » à l'affichage.
 * Le DTO ne porte que le libellé BRUT : un intitulé assemblé côté API serait figé en français.
 */
export const REMINDER_TARGET_LABEL_KEY = {
  PLAN: "reminder.target.plan",
  INVOICE: "reminder.target.invoice",
} as const satisfies Record<ReminderEntityType, string>;

// ── Report d'échéance (#105) ─────────────────────────────────────────────────

/**
 * Les raccourcis de report offerts par l'UI. Une table de deux valeurs plutôt qu'un champ libre :
 * « repousser » est le geste qu'on fait sans réfléchir quand un rappel tombe au mauvais moment, et
 * lui demander de saisir une date le transformerait en formulaire. L'édition fine reste possible
 * par le même `PATCH`, avec une échéance absolue.
 */
export const REMINDER_SNOOZE_OPTIONS = ["TOMORROW", "NEXT_WEEK"] as const;
export type ReminderSnoozeOption = (typeof REMINDER_SNOOZE_OPTIONS)[number];

const SNOOZE_DAYS = { TOMORROW: 1, NEXT_WEEK: 7 } as const satisfies Record<
  ReminderSnoozeOption,
  number
>;

/**
 * La nouvelle échéance d'un rappel repoussé, en instant ISO.
 *
 * Calculée depuis **maintenant**, pas depuis l'échéance courante : repousser un rappel en retard de
 * trois jours « à demain » doit donner demain, pas il y a deux jours. C'est le sens ordinaire du
 * geste, et le seul qui garantisse que le rappel ressorte bien dans le futur.
 *
 * Le décalage passe par `setDate` et non par une addition de millisecondes : ajouter 24 × 3600 × 1000
 * ferait dériver l'heure d'une heure aux changements d'heure d'été. On veut « demain à la même
 * heure », ce qui est une opération de calendrier, pas de durée.
 *
 * Côté CLIENT et non côté API, délibérément : `dueAt` est un instant absolu et l'API n'a aucun
 * fuseau — c'est le navigateur qui sait ce que « demain » veut dire pour son lecteur.
 */
export function snoozedDueAt(option: ReminderSnoozeOption, now: Date): string {
  const next = new Date(now);
  next.setDate(next.getDate() + SNOOZE_DAYS[option]);
  return next.toISOString();
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
  "id" | "entityType" | "entityId" | "note" | "reason" | "readAt" | "dueAt"
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
 * 2. **Le sujet suit `reminderLabel`**, et `actorName` est `null` : un rappel n'a pas d'acteur, le
 *    coach se le rappelle à lui-même. Une note est du texte du coach, donc voyage comme VALEUR
 *    (`subjectLabel`) ; un motif auto-généré voyage comme CLÉ (`subjectKey`), pour que son libellé
 *    ne soit pas figé en français dans une charge utile d'API. Le libellé de l'entrée, lui, reste
 *    rendu côté client (`NOTIFICATION_LABEL_KEY[REMINDER_DUE]`), comme tout le reste du centre.
 * 3. **Aucune ligne `notification` n'est écrite**, y compris depuis #47 : le scheduler POUSSE un
 *    rappel dû mais ne le persiste pas — c'est le choix « calculer », jamais les deux, sinon le
 *    même rappel apparaîtrait en double. `REMINDER_DUE` reste donc absent de l'enum Prisma, et le
 *    typecheck l'impose via `PersistedNotificationType`.
 */
export function reminderToNotificationDto(reminder: ReminderFeedSource): NotificationDto {
  const label = reminderLabel(reminder);

  return {
    id: toReminderFeedId(reminder.id),
    type: NotificationType.REMINDER_DUE,
    entityType: REMINDER_TARGET_ENTITY_TYPE[reminder.entityType],
    entityId: reminder.entityId,
    actorName: null,
    subjectLabel: label?.kind === "text" ? label.value : null,
    subjectKey: label?.kind === "key" ? label.value : null,
    readAt: reminder.readAt,
    createdAt: reminder.dueAt,
  };
}
