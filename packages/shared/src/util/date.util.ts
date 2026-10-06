// Calendrier — fonctions PURES sur des dates CIVILES ("YYYY-MM-DD") : ni heure, ni fuseau.
// L'arithmétique est calculée en UTC pour qu'un jour reste le même jour, que le device soit à
// Paris ou à Denver. Le fuseau n'entre qu'au moment de LIRE une horloge — « aujourd'hui », le jour
// d'un instant — et il est alors toujours dit : celui de l'appareil, ou un fuseau nommé (#321).
// Toute entrée invalide retourne `null` — jamais une date de repli (règle dure n°5).
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

// ── Lire une horloge ─────────────────────────────────────────────────────────

/**
 * Aujourd'hui, dans le fuseau de l'APPAREIL — le jour que son lecteur appelle aujourd'hui. C'est le
 * repère de « où en est l'athlète dans son cycle » et de « cette facture est-elle en retard ».
 *
 * Plus le jour UTC (#321) : le lundi à 0 h 30 à Paris, celui-ci rendait encore dimanche, et le
 * planning s'ouvrait sur la semaine passée. Lu par les accesseurs locaux et non par `Intl` : c'est
 * le chemin que tout moteur JavaScript tient, Hermes compris.
 */
export function todayIsoDate(): string {
  return localIsoDate(new Date());
}

/**
 * Le jour, dans le fuseau de l'appareil, où tombe un INSTANT ISO (`paidAt`, `joinedAt`) — pour
 * l'afficher comme une date. Tronquer la chaîne rendrait le jour UTC : un règlement saisi à 0 h 30
 * à Paris se serait affiché la veille. `null` si l'instant est illisible.
 */
export function isoDateOfInstant(instant: string): string | null {
  const time = Date.parse(instant);
  return Number.isNaN(time) ? null : localIsoDate(new Date(time));
}

function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Aujourd'hui dans un fuseau NOMMÉ (`"Europe/Paris"`) — pour qui n'a pas d'appareil dont lire le
 * fuseau : l'API. `null` si le fuseau est inconnu du moteur.
 */
export function todayIsoDateIn(timeZone: string): string | null {
  const clock = wallClockIn(timeZone);
  return clock == null ? null : clock(new Date()).isoDate;
}

/**
 * L'instant où commence `isoDate` dans `timeZone` : le premier moment du jour, à l'heure locale de
 * ce fuseau. C'est minuit — sauf là où l'heure change À minuit (Chili, quelques autres), où minuit
 * n'existe pas ce jour-là et où le jour commence à 1 h.
 *
 * Le décalage du fuseau dépend de l'instant, que l'on cherche justement : on essaie donc les deux
 * décalages en vigueur autour de minuit UTC, et l'on garde le plus tôt des instants qui tombent
 * bien le bon jour. `null` si la date est illisible, le fuseau inconnu — ou le jour inexistant dans
 * ce fuseau (les Samoa ont sauté le 30 décembre 2011).
 */
export function startOfIsoDateIn(isoDate: string, timeZone: string): Date | null {
  const midnightUtc = parseIsoDate(isoDate);
  const clock = wallClockIn(timeZone);
  if (midnightUtc == null || clock == null) return null;

  const first = new Date(midnightUtc.getTime() - clock(midnightUtc).offsetMs);
  const second = new Date(midnightUtc.getTime() - clock(first).offsetMs);
  const onTheDay = [first, second]
    .map((candidate) => candidate.getTime())
    .filter((time) => clock(new Date(time)).isoDate === isoDate);
  return onTheDay.length === 0 ? null : new Date(Math.min(...onTheDay));
}

type WallClock = (date: Date) => { isoDate: string; offsetMs: number };

/**
 * L'horloge murale de `timeZone` : pour un instant, le jour qu'elle affiche et son avance sur UTC.
 * `null` si le fuseau est inconnu — `Intl` lève alors, et c'est le seul endroit où on l'écoute.
 */
function wallClockIn(timeZone: string): WallClock | null {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return null;
  }

  return (date) => {
    const parts = format.formatToParts(date);
    const field = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const [year, month, day] = [field("year"), field("month"), field("day")];
    const wallAsUtc = Date.UTC(
      year,
      month - 1,
      day,
      field("hour"),
      field("minute"),
      field("second"),
    );
    // L'horloge n'affiche pas les millisecondes : on les retire de l'instant avant de comparer.
    const offsetMs = wallAsUtc - (date.getTime() - date.getUTCMilliseconds());
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { isoDate, offsetMs };
  };
}

// ── Arithmétique ─────────────────────────────────────────────────────────────

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
