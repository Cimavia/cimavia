import {
  formatIsoDate,
  formatIsoDateRange,
  formatIsoDateTime,
  formatIsoDayNumber,
  formatIsoFullDay,
  formatIsoWeekday,
  RELATIVE_TIME_KEY,
  relativeTimeFrom,
} from "@cmv/shared";
import i18n from "@/shared/lib/i18n";

/**
 * Adaptateur d'affichage : les formateurs (et le piège du fuseau) vivent dans @cmv/shared ; on ne
 * fait ici que leur fournir la locale courante d'i18next.
 */
export function formatWeekday(isoDate: string): string {
  return formatIsoWeekday(isoDate, i18n.language);
}

// « 14 oct. 2026 » — date civile (échéance de facture…).
export function formatDate(isoDate: string): string {
  return formatIsoDate(isoDate, i18n.language);
}

export function formatDayNumber(isoDate: string): string {
  return formatIsoDayNumber(isoDate, i18n.language);
}

export function formatFullDay(isoDate: string): string {
  return formatIsoFullDay(isoDate, i18n.language);
}

export function formatDateRange(startIsoDate: string, endIsoDate: string): string {
  return formatIsoDateRange(startIsoDate, endIsoDate, i18n.language);
}

// Un INSTANT (createdAt…), pas une date civile : affiché dans le fuseau de l'appareil.
export function formatDateTime(isoDateTime: string): string {
  return formatIsoDateTime(isoDateTime, i18n.language);
}

/**
 * « il y a 2 h » — ancienneté d'un instant récent (centre de notifications). Le comptage vient de
 * @cmv/shared, les libellés d'i18next ; au-delà d'une semaine il n'y a plus de forme relative
 * pertinente, on affiche alors la date complète.
 */
export function formatRelativeTime(isoDateTime: string): string {
  const relative = relativeTimeFrom(isoDateTime, new Date());
  if (relative == null) return formatDateTime(isoDateTime);
  return i18n.t(RELATIVE_TIME_KEY[relative.unit], { count: relative.value });
}
