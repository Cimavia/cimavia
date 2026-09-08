// La semaine de l'athlète quand PLUSIEURS cycles courent en même temps (#172).
//
// Avant, le planning était « la semaine N d'UN cycle » : un numéro dans l'URL, une `PlanWeekDto`
// dans la grille. Deux cycles concurrents n'ont aucune raison d'en être à la même semaine — la S3
// de l'un tombe sur la S1 de l'autre —, si bien que le numéro de semaine ne peut plus servir
// d'ossature. L'ossature devient la semaine CIVILE, et le numéro redevient ce qu'il est : une
// propriété de chaque cycle, affichée avec lui.

import type { PlanWeekType } from "../dto/plan.schema";
import {
  DAYS_PER_WEEK,
  isIsoDate,
  isMondayIsoDate,
  mondayOfIsoWeek,
  shiftIsoDate,
} from "./date.util";
import { planEndDate, planWeekDays } from "./plan.util";

/** Le strict nécessaire pour poser une séance dans un jour : sa date et son rang dans la journée. */
export type CalendarSession = { scheduledDate: string; position: number };

/**
 * `startDate` est celui que l'API calcule (`planWeekRange` à partir du seul `plan.startDate`) :
 * on le lit plutôt que de le recalculer, sans quoi deux dérivations de la même semaine
 * cohabiteraient et finiraient par diverger.
 */
export type CalendarWeek<S extends CalendarSession> = {
  weekNumber: number;
  type: PlanWeekType;
  note: string | null;
  startDate: string;
  sessions: readonly S[];
};

export type CalendarPlan<S extends CalendarSession> = {
  id: string;
  title: string;
  startDate: string;
  weekCount: number;
  weeks: readonly CalendarWeek<S>[];
};

/**
 * Une séance et le cycle d'où elle vient. Le nom du cycle voyage AVEC la séance, il ne se rejoint
 * pas par `planId` au rendu : deux séances le même mardi sont indiscernables sans lui, et c'est
 * exactement ce que l'accumulation rend possible.
 */
export type AthleteCalendarEntry<S extends CalendarSession> = {
  session: S;
  planId: string;
  planTitle: string;
};

export type AthleteCalendarDay<S extends CalendarSession> = {
  date: string;
  entries: AthleteCalendarEntry<S>[];
};

/** Un cycle qui a cours cette semaine-là, avec ce que le bandeau de tête en dit. */
export type AthleteCalendarCycle = {
  planId: string;
  title: string;
  /** La semaine DE CE CYCLE qui tombe dans la semaine civile — le « 3 » de « S3/4 ». */
  weekNumber: number;
  weekCount: number;
  type: PlanWeekType;
  note: string | null;
};

export type AthleteCalendarWeek<S extends CalendarSession> = {
  /** Lundi et dimanche de la semaine civile, bornes incluses. */
  startDate: string;
  endDate: string;
  /** Les 7 jours, toujours — une semaine sans séance se lit « rien de prévu », pas « rien ici ». */
  days: AthleteCalendarDay<S>[];
  /**
   * Les cycles qui couvrent cette semaine, dans l'ordre reçu. **Vide et jours vides ne disent pas
   * la même chose** : vide = aucun cycle n'a cours (l'athlète est hors cycle) ; non vide sans
   * entrée = une semaine de repos. L'écran doit les distinguer, sans quoi un cycle terminé se
   * lirait comme une semaine sans séance.
   */
  cycles: AthleteCalendarCycle[];
};

/**
 * La semaine civile du `monday` donné, alimentée par tous les cycles.
 *
 * `null` si `monday` n'est pas un lundi lisible : une grille décalée d'un jour serait pire qu'une
 * grille absente, et l'appelant tient son lundi de `defaultAthleteMonday` ou d'une navigation qui
 * part de lui.
 *
 * Les séances sont rangées par CYCLE (l'ordre d'arrivée, qui est celui de `selectVisiblePlans` —
 * en cours avant à venir) puis par `position` dans la journée. Deux séances du même jour gardent
 * ainsi un ordre stable, et le cycle en cours passe devant celui qui arrive.
 */
export function athleteCalendarWeek<S extends CalendarSession>(
  plans: readonly CalendarPlan<S>[],
  monday: string,
): AthleteCalendarWeek<S> | null {
  if (!isIsoDate(monday) || !isMondayIsoDate(monday)) return null;

  const days = planWeekDays(monday);
  const endDate = days?.[DAYS_PER_WEEK - 1];
  if (days == null || endDate == null) return null;

  const cycles: AthleteCalendarCycle[] = [];
  const entriesByDate = new Map<string, AthleteCalendarEntry<S>[]>();

  for (const plan of plans) {
    // La semaine du cycle qui COMMENCE ce lundi-là : les deux sont des lundis, l'égalité suffit.
    const week = plan.weeks.find((candidate) => candidate.startDate === monday);
    if (week == null) continue;

    cycles.push({
      planId: plan.id,
      title: plan.title,
      weekNumber: week.weekNumber,
      weekCount: plan.weekCount,
      type: week.type,
      note: week.note,
    });

    for (const session of [...week.sessions].sort((a, b) => a.position - b.position)) {
      const bucket = entriesByDate.get(session.scheduledDate);
      const entry = { session, planId: plan.id, planTitle: plan.title };
      if (bucket == null) entriesByDate.set(session.scheduledDate, [entry]);
      else bucket.push(entry);
    }
  }

  return {
    startDate: monday,
    endDate,
    days: days.map((date) => ({ date, entries: entriesByDate.get(date) ?? [] })),
    cycles,
  };
}

/** Jusqu'où l'athlète peut naviguer : premier et dernier lundi atteignables, bornes INCLUSES. */
export type AthleteCalendarBounds = { firstMonday: string; lastMonday: string };

/**
 * Jusqu'où la navigation peut aller : le lundi de la première semaine et celui de la dernière,
 * tous cycles confondus. C'est ce qui grise les flèches — sans bornes, l'athlète navigue
 * indéfiniment dans des semaines vides qui ne lui apprennent rien.
 *
 * `null` si aucun cycle n'est situable : il n'y a alors pas de plage à parcourir, et inventer des
 * bornes ouvrirait une navigation qui ne mène nulle part.
 */
export function athleteCalendarBounds<S extends CalendarSession>(
  plans: readonly CalendarPlan<S>[],
): AthleteCalendarBounds | null {
  const mondays = plans.flatMap((plan) => {
    const endDate = planEndDate(plan.startDate, plan.weekCount);
    const first = mondayOfIsoWeek(plan.startDate);
    const last = endDate == null ? null : mondayOfIsoWeek(endDate);
    return first == null || last == null ? [] : [{ first, last }];
  });

  const [head, ...tail] = mondays;
  if (head == null) return null;

  return tail.reduce(
    (bounds, plan) => ({
      firstMonday: plan.first < bounds.firstMonday ? plan.first : bounds.firstMonday,
      lastMonday: plan.last > bounds.lastMonday ? plan.last : bounds.lastMonday,
    }),
    { firstMonday: head.first, lastMonday: head.last },
  );
}

/** Les deux semaines atteignables depuis celle qu'on affiche — `null` du côté où il n'y en a pas. */
export type AthleteWeekNeighbours = { previous: string | null; next: string | null };

/**
 * Les voisines de la semaine affichée, ramenées à la plage réellement servie par les cycles.
 *
 * `null` d'un côté veut dire « pas de semaine de ce côté », que ce soit parce qu'on est SUR la
 * borne ou parce que `monday` est illisible. Les deux causes se rendent de la même façon — une
 * commande désactivée — et les distinguer donnerait à l'appelant un cas qu'il ne saurait pas
 * traiter autrement.
 *
 * Sans bornes, les deux sont `null` : c'est déjà ce que `athleteCalendarBounds` affirme en rendant
 * `null` — aucun cycle n'est situable, il n'y a donc pas de plage à parcourir.
 */
export function athleteWeekNeighbours(
  monday: string,
  bounds: AthleteCalendarBounds | null,
): AthleteWeekNeighbours {
  if (bounds == null) return { previous: null, next: null };

  const previous = shiftIsoDate(monday, -DAYS_PER_WEEK);
  const next = shiftIsoDate(monday, DAYS_PER_WEEK);

  return {
    previous: previous != null && previous >= bounds.firstMonday ? previous : null,
    next: next != null && next <= bounds.lastMonday ? next : null,
  };
}

/**
 * La semaine à ouvrir quand l'URL n'en demande aucune : celle d'aujourd'hui dès qu'un cycle a
 * cours, sinon le début du premier cycle de la liste.
 *
 * Le repli n'est pas silencieux : il ouvre une semaine que `athleteCalendarWeek` décrira comme
 * hors cycle (`cycles` vide) ou comme la première semaine d'un cycle à venir, et l'écran a de quoi
 * le dire. Ce qu'il évite, c'est d'ouvrir sur une semaine vide au milieu de nulle part quand le
 * seul cycle servi est à venir ou terminé.
 *
 * `null` sans aucun cycle situable — il n'y a alors pas de semaine à montrer, et l'écran affiche
 * son état vide plutôt qu'une grille de sept cases muettes.
 */
export function defaultAthleteMonday<S extends CalendarSession>(
  plans: readonly CalendarPlan<S>[],
  today: string,
): string | null {
  const bounds = athleteCalendarBounds(plans);
  if (bounds == null || !isIsoDate(today)) return null;

  const covered = plans.some((plan) => {
    const endDate = planEndDate(plan.startDate, plan.weekCount);
    return endDate != null && plan.startDate <= today && today <= endDate;
  });

  return covered ? mondayOfIsoWeek(today) : bounds.firstMonday;
}
