import i18n from "@/shared/lib/i18n";

/**
 * Affichage des dates civiles ("YYYY-MM-DD") de l'API.
 *
 * `timeZone: "UTC"` est ESSENTIEL : ces dates n'ont pas d'heure, et une lecture en heure locale
 * ferait basculer le 14 au 13 pour tout utilisateur à l'ouest de Greenwich. La locale vient
 * d'i18next — aucun format n'est écrit en dur (règle i18n).
 */
function toUtcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function format(isoDate: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(i18n.language, { ...options, timeZone: "UTC" }).format(
    toUtcDate(isoDate),
  );
}

// « lun. 14 » — en-tête d'une colonne de jour dans le builder.
export function formatDayLabel(isoDate: string): string {
  return format(isoDate, { weekday: "short", day: "numeric" });
}

// « 14 oct. 2026 » — date de début d'un cycle.
export function formatDate(isoDate: string): string {
  return format(isoDate, { day: "numeric", month: "short", year: "numeric" });
}

// « 12 – 18 oct. » — plage d'une semaine.
export function formatDateRange(startIsoDate: string, endIsoDate: string): string {
  const start = format(startIsoDate, { day: "numeric" });
  const end = format(endIsoDate, { day: "numeric", month: "short" });
  return `${start} – ${end}`;
}
