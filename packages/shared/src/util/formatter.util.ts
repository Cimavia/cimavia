import {
  formatIsoDate,
  formatIsoDateRange,
  formatIsoDateTime,
  formatIsoDayLabel,
  formatIsoDayNumber,
  formatIsoFullDay,
  formatIsoWeekday,
  formatRelativeOrDateTime,
} from "./date-format.util";
import { formatInvoicePeriod, formatMoney } from "./money.util";

/**
 * Les formateurs d'une app, déjà branchés sur sa locale.
 *
 * Chaque formateur de ce paquet prend sa `locale` en DERNIER paramètre, pour rester pur : il ne
 * connaît ni i18next ni l'instance d'une app. La conséquence est que chaque app réécrivait la même
 * ligne d'injection pour chacun d'eux — deux fichiers d'adaptateurs identiques au commentaire
 * près, et une fonction de plus à brancher deux fois (#137).
 *
 * La fabrique renverse ça : l'app injecte sa locale UNE fois, et reçoit des formateurs qui n'en
 * parlent plus. Ajouter un formateur ici ne demande plus qu'un nom de plus dans la déstructuration
 * de chaque app, pas un corps de fonction.
 */
export type Formatters = {
  /** Le montant, divisé par 100 et rendu dans sa devise. */
  formatMoney: (amountCents: number, currency: string) => string;
  /** La période de facturation « 2026-09 », dite en toutes lettres. */
  formatPeriod: (period: string) => string;
  /** « 14 oct. 2026 » — une date CIVILE (échéance de facture, jour d'une séance). */
  formatDate: (isoDate: string) => string;
  /** « lun. 14 » — l'en-tête d'un jour dans une grille de semaine. */
  formatDayLabel: (isoDate: string) => string;
  /** « lun. 14 oct. » — le jour, dit en entier. */
  formatFullDay: (isoDate: string) => string;
  /** « LUN » — l'en-tête de colonne d'une grille de semaine. */
  formatWeekday: (isoDate: string) => string;
  /** « 14 » — le seul numéro du jour. */
  formatDayNumber: (isoDate: string) => string;
  /** « 12 – 18 oct. 2026 » — les bornes d'une semaine ou d'un cycle. */
  formatDateRange: (startIsoDate: string, endIsoDate: string) => string;
  /**
   * Un INSTANT (`Reminder.dueAt`, `expiresAt`…), affiché dans le fuseau du LECTEUR.
   *
   * Jamais `formatDate` sur un instant : celui-ci lit les dates civiles en UTC et décalerait donc
   * d'un jour aux abords de minuit.
   */
  formatDateTime: (isoDateTime: string) => string;
  /** « il y a 2 h », ou la date complète au-delà d'une semaine. La bascule vit dans ce paquet. */
  formatRelativeTime: (isoDateTime: string) => string;
};

/**
 * `getLocale` est une FONCTION et non une chaîne : la locale change quand l'utilisateur change de
 * langue, et une valeur lue au démarrage figerait tous les formats jusqu'au prochain lancement.
 *
 * `translate` est injecté pour la même raison que dans `notificationSubject` — ce paquet ne connaît
 * pas i18next, et chaque app a son instance.
 */
export function createFormatters(
  getLocale: () => string,
  translate: (key: string, params: { count: number }) => string,
): Formatters {
  return {
    formatMoney: (amountCents, currency) => formatMoney(amountCents, currency, getLocale()),
    formatPeriod: (period) => formatInvoicePeriod(period, getLocale()),
    formatDate: (isoDate) => formatIsoDate(isoDate, getLocale()),
    formatDayLabel: (isoDate) => formatIsoDayLabel(isoDate, getLocale()),
    formatFullDay: (isoDate) => formatIsoFullDay(isoDate, getLocale()),
    formatWeekday: (isoDate) => formatIsoWeekday(isoDate, getLocale()),
    formatDayNumber: (isoDate) => formatIsoDayNumber(isoDate, getLocale()),
    formatDateRange: (start, end) => formatIsoDateRange(start, end, getLocale()),
    formatDateTime: (isoDateTime) => formatIsoDateTime(isoDateTime, getLocale()),
    formatRelativeTime: (isoDateTime) =>
      formatRelativeOrDateTime(isoDateTime, new Date(), getLocale(), translate),
  };
}
