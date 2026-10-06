import {
  dateToIsoDate,
  isoDateToDate,
  shiftDate,
  startOfIsoDateIn,
  todayIsoDateIn,
} from "@cmv/shared";

/**
 * Pont entre les dates civiles des DTO ("YYYY-MM-DD") et les colonnes `@db.Date` de Prisma, qui se
 * manipulent en `Date`. Toute la logique (parsing, décalage, fuseau) vit dans @cmv/shared : ici on
 * ne fait que la POLITIQUE de l'API — une date illisible en base est une donnée corrompue, donc on
 * lève, là où les fonctions partagées, elles, retournent `null`.
 */

export function toDbDate(isoDate: string): Date {
  const date = isoDateToDate(isoDate);
  if (date == null) {
    throw new Error(`[date] date civile illisible : ${isoDate}`);
  }
  return date;
}

export function toIsoDate(date: Date): string {
  return dateToIsoDate(date);
}

export function shiftDbDate(date: Date, days: number): Date {
  const shifted = shiftDate(date, days);
  if (shifted == null) {
    throw new Error(
      `[date] décalage impossible (${date.toISOString()} ${days > 0 ? "+" : ""}${days}j)`,
    );
  }
  return shifted;
}

/**
 * Le fuseau qui fait foi côté serveur pour dire « aujourd'hui » et « en retard » (« Tranché en
 * #321 ») : l'API n'a pas d'appareil dont lire un fuseau, et le produit est français. Un client,
 * lui, compte dans le fuseau de son appareil (`todayIsoDate` de @cmv/shared) — les deux ne
 * s'accordent donc que pour un lecteur en métropole, ce que le journal de dette consigne.
 */
export const PRODUCT_TIME_ZONE = "Europe/Paris";

/** Aujourd'hui, à l'heure du produit. Le fuseau n'est un paramètre que pour être éprouvé. */
export function productToday(timeZone: string = PRODUCT_TIME_ZONE): string {
  const today = todayIsoDateIn(timeZone);
  if (today == null) {
    throw new Error(`[date] fuseau inconnu : ${timeZone}`);
  }
  return today;
}

/**
 * L'instant où commence, à l'heure du produit, le jour d'une colonne `@db.Date` — minuit à Paris,
 * et non minuit UTC, qui y tombe à 1 h ou 2 h du matin.
 */
export function startOfProductDay(day: Date, timeZone: string = PRODUCT_TIME_ZONE): Date {
  const start = startOfIsoDateIn(dateToIsoDate(day), timeZone);
  if (start == null) {
    throw new Error(`[date] début de jour introuvable (${dateToIsoDate(day)}, ${timeZone})`);
  }
  return start;
}
