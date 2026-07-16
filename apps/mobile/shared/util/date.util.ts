import {
  formatIsoDateRange,
  formatIsoDayNumber,
  formatIsoFullDay,
  formatIsoWeekday,
} from "@cmv/shared";
import i18n from "@/shared/lib/i18n";

/**
 * Adaptateur d'affichage : les formateurs (et le piège du fuseau) vivent dans @cmv/shared ; on ne
 * fait ici que leur fournir la locale courante d'i18next.
 */
export function formatWeekday(isoDate: string): string {
  return formatIsoWeekday(isoDate, i18n.language);
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
