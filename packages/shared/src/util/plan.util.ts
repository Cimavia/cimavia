// Logique pure des planifications (cycle → semaines → séances), partagée API ↔ web ↔ mobile.
// S'appuie sur le calendrier générique (date.util) : ici, seule la notion de CYCLE est traitée.

import { ScheduledSessionStatus } from "../dto/plan.schema";
import { DAYS_PER_WEEK, daysBetweenIsoDates, isIsoDate, shiftIsoDate } from "./date.util";

// Une semaine de plan, bornes incluses (lundi → dimanche).
export type PlanWeekRange = { startDate: string; endDate: string };

// Le strict nécessaire pour compter : le statut d'une séance planifiée.
export type SessionProgressSource = { status: string };

// Où en est une semaine : combien de séances faites sur combien de prévues.
export type SessionProgress = { done: number; total: number };

/**
 * L'avancement d'une semaine — « 2/5 séances faites ».
 *
 * Les deux nombres ensemble plutôt que deux fonctions : ils sont toujours affichés ensemble, et un
 * `done` sans son `total` ne veut rien dire. Un seul parcours, donc, et surtout **une seule
 * définition de « fait »** : `DONE`, posé par le débrief et par lui seul (`SKIPPED` n'est pas un
 * accomplissement, c'est une séance sautée).
 *
 * `null` sur une liste absente (chargement, panne) — jamais `{ done: 0, total: 0 }`, qui se lirait
 * « semaine vide, rien à faire » et rendrait une API injoignable indiscernable d'un repos.
 */
export function weekSessionProgress(
  sessions: readonly SessionProgressSource[] | null | undefined,
): SessionProgress | null {
  if (sessions == null) return null;
  return {
    done: sessions.filter((session) => session.status === ScheduledSessionStatus.DONE).length,
    total: sessions.length,
  };
}

// Le minimum pour situer un plan dans le temps : sa date de début et son nombre de semaines.
export type PlanPeriod = { startDate: string; weekCount: number };

// Une semaine désignée par son cycle : de quoi la situer dans le calendrier sans la charger.
// Les deux champs sont nécessaires — le numéro seul ne dit rien tant qu'on ignore d'où il compte.
export type PlanWeekRef = { planStartDate: string; weekNumber: number };

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
 * De combien de jours décaler le contenu d'une semaine copiée vers une autre (#4).
 *
 * Copier une semaine n'emporte PAS ses dates, seulement ce qui y est planifié : les
 * `scheduledDate` sont recalculées à partir du lundi de la semaine cible. Une séance du mardi
 * reste donc le mardi, mais du mardi de la semaine d'arrivée.
 *
 * Le décalage se prend entre les deux LUNDIS, jamais entre les numéros de semaine : `(M−N)×7`
 * ne vaut qu'à l'intérieur d'un même cycle, alors que la copie traverse aussi deux cycles aux
 * `startDate` différents. Les deux étant des lundis (`planStartDateSchema`), le résultat est
 * toujours un multiple de 7 — c'est ce qui préserve le jour de la semaine, et ce qui garde
 * `@@unique([planWeekId, scheduledDate, position])` satisfaite après translation.
 *
 * `null` si l'une des deux semaines n'est pas situable (date illisible, numéro hors bornes) —
 * surtout pas `0`, qui est un décalage LÉGITIME (deux semaines alignées) et ne doit pas servir
 * de repli à « je n'ai pas su calculer ».
 */
export function planWeekCopyShiftDays(source: PlanWeekRef, target: PlanWeekRef): number | null {
  const from = planWeekRange(source.planStartDate, source.weekNumber);
  const to = planWeekRange(target.planStartDate, target.weekNumber);
  if (from == null || to == null) return null;
  return daysBetweenIsoDates(from.startDate, to.startDate);
}

/**
 * Dans quelle semaine du cycle tombe `date` — le « S3 » de « S3/4 », 1-based.
 *
 * `null` dès que la date est HORS du cycle (avant son lundi de départ, ou après son dernier
 * dimanche) : un cycle qui n'a pas commencé n'en est pas à sa semaine 1, et un cycle terminé n'en
 * est pas à sa dernière. Rendre 1 ou `weekCount` dans ces cas afficherait une progression inventée
 * — c'est exactement le repli silencieux que la règle nullable interdit.
 *
 * Se déduit du seul `startDate` (un lundi) : aucune date n'est stockée sur `PlanWeek`, donc aucune
 * dérive possible entre les deux représentations.
 */
export function planWeekNumber(plan: PlanPeriod, date: string): number | null {
  if (!Number.isInteger(plan.weekCount) || plan.weekCount < 1) return null;

  const elapsed = daysBetweenIsoDates(plan.startDate, date);
  if (elapsed == null || elapsed < 0) return null;

  const weekNumber = Math.floor(elapsed / DAYS_PER_WEEK) + 1;
  return weekNumber > plan.weekCount ? null : weekNumber;
}

// Où un cycle se situe par rapport à une date : il l'attend, il la contient, il l'a dépassée.
export type PlanPhase = "UPCOMING" | "ONGOING" | "ENDED";

/**
 * L'époque d'un cycle — ce que `planWeekNumber` ne dit pas.
 *
 * `planWeekNumber` répond « quelle semaine », et son `null` recouvre DEUX situations contraires :
 * pas encore commencé, et déjà fini. L'affichage comme le filtrage doivent les séparer — un cycle
 * à venir est un cycle que le coach a DÉJÀ planifié, un cycle terminé est un athlète à relancer.
 * Les confondre reviendrait à dire la même chose de deux états opposés.
 *
 * Les deux fonctions ne peuvent pas diverger : `ONGOING` vaut exactement quand `planWeekNumber`
 * rend un numéro — mêmes bornes de part et d'autre, invariant tenu par un test.
 *
 * `null` quand le cycle n'est pas situable (date illisible, `weekCount` invalide) — surtout pas une
 * époque par défaut, qui rangerait un cycle illisible parmi les terminés et le ferait ressortir
 * dans un filtre « à relancer ».
 */
export function planPhase(plan: PlanPeriod, date: string): PlanPhase | null {
  // `planEndDate` rend `null` sur un `startDate` illisible comme sur un `weekCount` invalide : les
  // deux causes d'un cycle non situable passent par ce seul test.
  const endDate = planEndDate(plan.startDate, plan.weekCount);
  if (endDate == null || !isIsoDate(date)) return null;

  if (date < plan.startDate) return "UPCOMING";
  if (date > endDate) return "ENDED";
  return "ONGOING";
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
