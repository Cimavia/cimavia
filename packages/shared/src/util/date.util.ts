// Calendrier — fonctions PURES sur des dates CIVILES ("YYYY-MM-DD") : ni heure, ni fuseau.
// Tout est calculé en UTC pour qu'un jour reste le même jour, que le device soit à Paris ou
// à Denver. Toute entrée invalide retourne `null` — jamais une date de repli (règle dure n°5).
// Ces dates se comparent directement (`<`, `>`) : le format est à largeur fixe, donc l'ordre
// lexicographique est l'ordre chronologique.

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONDAY = 1;

export const DAYS_PER_WEEK = 7;

// ── Ponts avec l'objet Date ──────────────────────────────────────────────────
// Utiles là où une date civile croise une API qui parle `Date` (colonnes Prisma `@db.Date`,
// Intl.DateTimeFormat). Le parsing — et son piège — n'est écrit qu'ICI.

export function isoDateToDate(isoDate: string): Date | null {
  return parseIsoDate(isoDate);
}

export function dateToIsoDate(date: Date): string {
  return toIsoDate(date);
}

// Décale une `Date` d'un nombre de jours, en repassant par la date civile (donc sans dérive
// d'heure d'été). `null` si la date est incohérente.
export function shiftDate(date: Date, days: number): Date | null {
  const shifted = shiftIsoDate(toIsoDate(date), days);
  return shifted == null ? null : parseIsoDate(shifted);
}

function parseIsoDate(isoDate: string): Date | null {
  if (!ISO_DATE_PATTERN.test(isoDate)) return null;
  const time = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  const date = new Date(time);
  // Date.parse REPORTE une date inexistante au lieu de la refuser (2026-02-31 → 2026-03-03) :
  // seul l'aller-retour la démasque.
  return toIsoDate(date) === isoDate ? date : null;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(isoDate: string): boolean {
  return parseIsoDate(isoDate) != null;
}

// Aujourd'hui, en date civile UTC — le repère de « où en est l'athlète dans son cycle ».
export function todayIsoDate(): string {
  return toIsoDate(new Date());
}

export function shiftIsoDate(isoDate: string, days: number): string | null {
  const date = parseIsoDate(isoDate);
  if (date == null || !Number.isInteger(days)) return null;
  return toIsoDate(new Date(date.getTime() + days * MS_PER_DAY));
}

// Nombre de jours de `from` à `to` (négatif si `to` précède `from`).
export function daysBetweenIsoDates(from: string, to: string): number | null {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (start == null || end == null) return null;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

export function isMondayIsoDate(isoDate: string): boolean {
  return parseIsoDate(isoDate)?.getUTCDay() === MONDAY;
}

// Le lundi de la semaine contenant `isoDate` (les semaines cimavia vont du lundi au dimanche).
// Sert autant à caler la date de début d'un cycle qu'à situer « cette semaine » côté athlète.
export function mondayOfIsoWeek(isoDate: string): string | null {
  const date = parseIsoDate(isoDate);
  if (date == null) return null;
  const weekday = date.getUTCDay(); // 0 = dimanche
  const toMonday = weekday === 0 ? -6 : MONDAY - weekday;
  return shiftIsoDate(isoDate, toMonday);
}
