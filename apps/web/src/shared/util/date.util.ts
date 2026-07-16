import {
  formatIsoDate,
  formatIsoDateRange,
  formatIsoDateTime,
  formatIsoDayLabel,
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
