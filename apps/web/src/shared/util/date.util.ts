import {
  formatIsoDate,
  formatIsoDateRange,
  formatIsoDateTime,
  formatIsoDayLabel,
  RELATIVE_TIME_KEY,
  relativeTimeFrom,
} from "@cmv/shared";
import i18n from "@/shared/lib/i18n";

/**
 * Adaptateur d'affichage : les formateurs (et le piège du fuseau) vivent dans @cmv/shared ; on ne
 * fait ici que leur fournir la locale courante d'i18next, pour ne pas la répéter à chaque appel.
 */
export function formatDate(isoDate: string): string {
  return formatIsoDate(isoDate, i18n.language);
}

export function formatDayLabel(isoDate: string): string {
  return formatIsoDayLabel(isoDate, i18n.language);
}

export function formatDateRange(startIsoDate: string, endIsoDate: string): string {
  return formatIsoDateRange(startIsoDate, endIsoDate, i18n.language);
}

// Un INSTANT (expiresAt…), pas une date civile : affiché dans le fuseau de l'utilisateur.
export function formatDateTime(isoDateTime: string): string {
  return formatIsoDateTime(isoDateTime, i18n.language);
}

/**
 * « il y a 2 h » — ancienneté d'un instant récent (centre de notifications). Le comptage vient de
 * @cmv/shared, les libellés d'i18next : au-delà d'une semaine il n'y a plus de forme relative
 * pertinente, on affiche alors la date complète.
 */
export function formatRelativeTime(isoDateTime: string): string {
  const relative = relativeTimeFrom(isoDateTime, new Date());
  if (relative == null) return formatDateTime(isoDateTime);
  return i18n.t(RELATIVE_TIME_KEY[relative.unit], { count: relative.value });
}
