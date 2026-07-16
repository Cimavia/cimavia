// Logique pure des planifications (cycle → semaines → séances), partagée API ↔ web ↔ mobile.
// S'appuie sur le calendrier générique (date.util) : ici, seule la notion de CYCLE est traitée.

import { DAYS_PER_WEEK, isIsoDate, shiftIsoDate } from "./date.util";

// Une semaine de plan, bornes incluses (lundi → dimanche).
export type PlanWeekRange = { startDate: string; endDate: string };

// Le minimum pour situer un plan dans le temps : sa date de début et son nombre de semaines.
export type PlanPeriod = { startDate: string; weekCount: number };

// Plage de la semaine `weekNumber` (1-based) d'un plan démarrant à `planStartDate` (un lundi,
// contrainte portée par planStartDateSchema) : aucune date n'est stockée sur PlanWeek, elle se
// déduit du seul `startDate` du plan → pas de dérive possible entre les deux.
export function planWeekRange(planStartDate: string, weekNumber: number): PlanWeekRange | null {
  if (!Number.isInteger(weekNumber) || weekNumber < 1) return null;
  const startDate = shiftIsoDate(planStartDate, (weekNumber - 1) * DAYS_PER_WEEK);
  if (startDate == null) return null;
  const endDate = shiftIsoDate(startDate, DAYS_PER_WEEK - 1);
  if (endDate == null) return null;
  return { startDate, endDate };
}

// Les 7 jours (lundi → dimanche) d'une semaine, à partir de son lundi. `null` si la date est
// illisible. Sert aussi bien au builder du coach qu'à la vue semaine de l'athlète.
export function planWeekDays(weekStartDate: string): string[] | null {
  const days: string[] = [];
  for (let index = 0; index < DAYS_PER_WEEK; index++) {
    const day = shiftIsoDate(weekStartDate, index);
    if (day == null) return null;
    days.push(day);
  }
  return days;
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
  if (range == null || !isIsoDate(date)) return false;
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
  if (!isIsoDate(today)) return null;

  const dated = plans.flatMap((plan) => {
    const endDate = planEndDate(plan.startDate, plan.weekCount);
    if (endDate == null) return [];
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
