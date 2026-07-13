import { shiftIsoDate } from "@cmv/shared";

// Pont entre les dates civiles des DTO ("YYYY-MM-DD", cf. @cmv/shared/date.util) et les colonnes
// `@db.Date` de Prisma, qui se manipulent en `Date`. Postgres stocke un jour sans heure ; Prisma
// le rend en Date à minuit UTC. On reste donc en UTC des deux côtés : aucune conversion locale,
// donc aucun décalage de jour selon le fuseau du serveur.
// Rien de métier ici — l'arithmétique de dates vit dans @cmv/shared (partagée avec les clients).

export function toDbDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Décalage d'une date de colonne, délégué à la logique pure partagée (pas d'arithmétique de
// dates réécrite ici). `null` ne survient que sur une date corrompue en base → on lève.
export function shiftDbDate(date: Date, days: number): Date {
  const shifted = shiftIsoDate(toIsoDate(date), days);
  if (shifted == null) {
    throw new Error(
      `[date] décalage impossible (${date.toISOString()} ${days > 0 ? "+" : ""}${days}j)`,
    );
  }
  return toDbDate(shifted);
}
