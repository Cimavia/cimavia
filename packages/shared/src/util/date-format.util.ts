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

// ── Temps relatif (« il y a 2 h ») ───────────────────────────────────────────

export type RelativeTimeUnit = "now" | "minute" | "hour" | "day";
export type RelativeTime = { unit: RelativeTimeUnit; value: number };

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
// Au-delà d'une semaine, « il y a 23 jours » informe moins qu'une date : on rend la main.
const RELATIVE_MAX_DAYS = 7;

/**
 * Clé i18n par unité. Le comptage est ici (pur, testé), les LIBELLÉS restent dans les fichiers de
 * traduction des apps — avec leurs formes plurielles, que i18next résout via `count`.
 */
export const RELATIVE_TIME_KEY = {
  now: "common.relativeTime.now",
  minute: "common.relativeTime.minute",
  hour: "common.relativeTime.hour",
  day: "common.relativeTime.day",
} as const satisfies Record<RelativeTimeUnit, string>;

/**
 * Ancienneté d'un instant, en parts prêtes à traduire — délibérément SANS locale, contrairement au
 * reste du fichier.
 *
 * Deux raisons de ne pas passer par `Intl.RelativeTimeFormat` : son support n'est pas garanti sous
 * Hermes (mobile), et il produirait une chaîne hors du circuit i18next — donc une string en dur
 * déguisée (règle dure n°6).
 *
 * Retourne `null` quand aucune forme relative n'est pertinente : instant illisible, horloge en
 * avance, ou plus vieux qu'une semaine. L'appelant affiche alors la date absolue
 * (`formatIsoDateTime`) — ce n'est pas une valeur de repli, c'est l'autre façon de dire la même
 * chose, et elle est plus honnête.
 */
export function relativeTimeFrom(isoDateTime: string, now: Date): RelativeTime | null {
  const instant = Date.parse(isoDateTime);
  if (Number.isNaN(instant)) return null;

  const minutes = Math.floor((now.getTime() - instant) / MS_PER_MINUTE);
  if (minutes < 0) return null;
  if (minutes < 1) return { unit: "now", value: 0 };
  if (minutes < MINUTES_PER_HOUR) return { unit: "minute", value: minutes };

  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return { unit: "hour", value: hours };

  const days = Math.floor(hours / HOURS_PER_DAY);
  return days <= RELATIVE_MAX_DAYS ? { unit: "day", value: days } : null;
}

/**
 * « il y a 2 h », ou la date complète au-delà d'une semaine. La bascule entre les deux formes est
 * une décision d'affichage identique web et mobile : la laisser dans chaque app, c'était accepter
 * qu'elles divergent (et Sonar l'avait vu — bloc dupliqué entre les deux `date.util.ts`).
 *
 * `translate` est INJECTÉ : ce module reste pur et sans dépendance à l'instance i18n d'une app,
 * comme la `locale` l'est déjà pour les formateurs Intl ci-dessus.
 */
export function formatRelativeOrDateTime(
  isoDateTime: string,
  now: Date,
  locale: string,
  translate: (key: string, params: { count: number }) => string,
): string {
  const relative = relativeTimeFrom(isoDateTime, now);
  if (relative == null) return formatIsoDateTime(isoDateTime, locale);
  return translate(RELATIVE_TIME_KEY[relative.unit], { count: relative.value });
}
