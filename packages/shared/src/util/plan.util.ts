// Logique pure des dates de planification, partagée API ↔ web ↔ mobile.
// Une date de planif est une date CIVILE ("YYYY-MM-DD") : ni heure, ni fuseau. Tout est calculé
// en UTC pour qu'un lundi reste le même lundi, que le device soit à Paris ou à Denver.
// Toute entrée invalide retourne `null` — jamais une date de repli (règle dure n°5).

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MONDAY = 1;

export const DAYS_PER_WEEK = 7;

// Une semaine de plan, bornes incluses (lundi → dimanche).
export type PlanWeekRange = { startDate: string; endDate: string };

// Le minimum pour situer un plan dans le temps : sa date de début et son nombre de semaines.
export type PlanPeriod = { startDate: string; weekCount: number };

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

// Un Plan démarre un lundi : la semaine 1 couvre alors un vrai lundi→dimanche, et la plage
// d'une semaine se déduit du seul `startDate` (pas de date stockée sur PlanWeek).
export function isMondayIsoDate(isoDate: string): boolean {
  return parseIsoDate(isoDate)?.getUTCDay() === MONDAY;
}

// Plage de la semaine `weekNumber` (1-based) d'un plan démarrant à `planStartDate`.
export function planWeekRange(planStartDate: string, weekNumber: number): PlanWeekRange | null {
  if (!Number.isInteger(weekNumber) || weekNumber < 1) return null;
  const startDate = shiftIsoDate(planStartDate, (weekNumber - 1) * DAYS_PER_WEEK);
  if (startDate == null) return null;
  const endDate = shiftIsoDate(startDate, DAYS_PER_WEEK - 1);
  if (endDate == null) return null;
  return { startDate, endDate };
}

// Dernier jour du cycle (dimanche de la dernière semaine). `null` si le plan n'a aucune semaine.
export function planEndDate(planStartDate: string, weekCount: number): string | null {
  if (!Number.isInteger(weekCount) || weekCount < 1) return null;
  return shiftIsoDate(planStartDate, weekCount * DAYS_PER_WEEK - 1);
}

// La date tombe-t-elle dans la semaine `weekNumber` du plan ? (invariant vérifié à l'écriture
// d'une séance planifiée, côté API — et réutilisable par le client pour désactiver les jours.)
export function isDateInPlanWeek(planStartDate: string, weekNumber: number, date: string): boolean {
  const range = planWeekRange(planStartDate, weekNumber);
  if (range == null || parseIsoDate(date) == null) return false;
  // Les dates ISO se comparent lexicographiquement (format à largeur fixe).
  return date >= range.startDate && date <= range.endDate;
}

/**
 * Le plan « courant » d'un athlète parmi ses plans diffusés, à la date `today` :
 * en cours > à venir (le plus proche) > terminé (le plus récent) > `null`.
 * Entre deux cycles, l'athlète veut voir celui qui arrive, pas celui qu'il vient de finir.
 * Source UNIQUE de ce choix (API + clients) — ne pas le reconstituer ailleurs.
 */
export function selectCurrentPlan<T extends PlanPeriod>(
  plans: readonly T[],
  today: string,
): T | null {
  if (parseIsoDate(today) == null) return null;

  const dated = plans.flatMap((plan) => {
    const endDate = planEndDate(plan.startDate, plan.weekCount);
    if (endDate == null || parseIsoDate(plan.startDate) == null) return [];
    return [{ plan, endDate }];
  });

  const ongoing = dated.filter((p) => p.plan.startDate <= today && today <= p.endDate);
  // Plusieurs cycles en cours = le coach en a diffusé un remplaçant → le plus récent gagne.
  if (ongoing.length > 0) return pickByStartDate(ongoing, "latest");

  const upcoming = dated.filter((p) => p.plan.startDate > today);
  if (upcoming.length > 0) return pickByStartDate(upcoming, "earliest");

  const past = dated.filter((p) => p.endDate < today);
  if (past.length > 0) return pickByStartDate(past, "latest");

  return null;
}

function pickByStartDate<T extends PlanPeriod>(
  entries: readonly { plan: T }[],
  pick: "earliest" | "latest",
): T | null {
  let best: T | null = null;
  for (const { plan } of entries) {
    if (best == null) {
      best = plan;
      continue;
    }
    const wins =
      pick === "latest" ? plan.startDate > best.startDate : plan.startDate < best.startDate;
    if (wins) best = plan;
  }
  return best;
}
