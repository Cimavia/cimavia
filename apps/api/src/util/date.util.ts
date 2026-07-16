import { dateToIsoDate, isoDateToDate, shiftDate } from "@cmv/shared";

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
