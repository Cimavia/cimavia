import { isoDateToDate } from "./date.util";

/**
 * Formatage LOCALISÉ des dates, partagé web ↔ mobile (Intl est disponible des deux côtés).
 *
 * `timeZone: "UTC"` est le point ESSENTIEL, et la raison d'être de ce fichier : une date civile
 * ("2026-10-14") n'a pas d'heure. La lire en heure locale ferait afficher « 13 » à tout
 * utilisateur à l'ouest de Greenwich. Ce piège ne doit être résolu qu'une fois — d'où la
 * remontée ici plutôt qu'un helper par app.
 *
 * La `locale` est passée par l'appelant (i18next côté app) : ce module reste pur, sans dépendance
 * à l'instance i18n d'une app.
 */
function format(isoDate: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const date = isoDateToDate(isoDate);
  if (date == null) {
    throw new Error(`[date] date civile illisible : ${isoDate}`);
  }
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date);
}

// « 14 oct. 2026 » — date de début d'un cycle, échéance…
export function formatIsoDate(isoDate: string, locale: string): string {
  return format(isoDate, locale, { day: "numeric", month: "short", year: "numeric" });
}

// « lun. 14 » — en-tête d'un jour.
export function formatIsoDayLabel(isoDate: string, locale: string): string {
  return format(isoDate, locale, { weekday: "short", day: "numeric" });
}

// « mer. 16 oct. » — en-tête du détail d'une séance.
export function formatIsoFullDay(isoDate: string, locale: string): string {
  return format(isoDate, locale, { weekday: "short", day: "numeric", month: "short" });
}

// « LUN. » / « 14 » — colonne de jour (vue semaine mobile).
export function formatIsoWeekday(isoDate: string, locale: string): string {
  return format(isoDate, locale, { weekday: "short" }).toUpperCase();
}

export function formatIsoDayNumber(isoDate: string, locale: string): string {
  return format(isoDate, locale, { day: "numeric" });
}

// « 12 – 18 oct. » — plage d'une semaine de cycle.
export function formatIsoDateRange(
  startIsoDate: string,
  endIsoDate: string,
  locale: string,
): string {
  const start = format(startIsoDate, locale, { day: "numeric" });
  const end = format(endIsoDate, locale, { day: "numeric", month: "short" });
  return `${start} – ${end}`;
}

/**
 * « 20 juil. 2026, 14:35 » — pour un INSTANT (`createdAt`, `expiresAt`…), pas une date civile.
 * Ici, PAS de `timeZone: "UTC"` : un horodatage a une heure réelle, qu'on affiche dans le fuseau
 * de l'utilisateur. C'est exactement l'inverse de la règle ci-dessus, d'où la fonction séparée.
 */
export function formatIsoDateTime(isoDateTime: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDateTime));
}
