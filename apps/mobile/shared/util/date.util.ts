import {
  formatIsoDate,
  formatIsoDateRange,
  formatIsoDateTime,
  formatIsoDayNumber,
  formatIsoFullDay,
  formatIsoWeekday,
  formatRelativeOrDateTime,
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

/**
 * Un INSTANT (`Reminder.dueAt`…), affiché dans le fuseau du lecteur — jamais `formatDate`, qui lit
 * les dates CIVILES en UTC et décalerait donc d'un jour aux abords de minuit.
 */
export function formatDateTime(isoDateTime: string): string {
  return formatIsoDateTime(isoDateTime, i18n.language);
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

// « il y a 2 h », ou la date complète au-delà d'une semaine. La bascule vit dans @cmv/shared
// (identique côté web) ; on ne fournit ici que la locale et le traducteur courants.
export function formatRelativeTime(isoDateTime: string): string {
  return formatRelativeOrDateTime(isoDateTime, new Date(), i18n.language, (key, params) =>
    i18n.t(key, params),
  );
}
