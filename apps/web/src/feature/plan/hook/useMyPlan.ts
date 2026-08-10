import type { PlanDto, PlanWeekDto, ScheduledSessionDto } from "@cmv/shared";
import { isDateInPlanWeek } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { athletePlanApi, myPlanKeys } from "@/feature/plan/api";

/**
 * Le cycle diffusé de l'athlète courant — `null` s'il n'en a aucun.
 *
 * Une seule requête porte les trois écrans athlète (planning, séances, détail) : le cycle embarque
 * déjà ses semaines et ses séances. Le détail d'une séance, lui, demande sa propre requête — c'est
 * lui qui porte les exercices et leurs documents.
 */
export function useMyPlan() {
  return useQuery<PlanDto | null>({
    queryKey: myPlanKeys.current(),
    queryFn: athletePlanApi.current,
  });
}

// Détail d'une séance : exercices, consignes, documents (URLs signées, donc réseau requis).
export function useMyScheduledSession(sessionId: string) {
  return useQuery<ScheduledSessionDto>({
    queryKey: myPlanKeys.session(sessionId),
    queryFn: () => athletePlanApi.session(sessionId),
  });
}

/**
 * La semaine du cycle qui contient `today`, ou `null` si le cycle n'a pas (encore / plus) cours —
 * pas de repli sur la semaine 1, qui afficherait un passé pour un présent.
 *
 * Même dérivation que côté mobile, et volontairement NON partagée : elle tient en une ligne
 * au-dessus d'`isDateInPlanWeek`, qui est la règle, et qui vit déjà dans `@cmv/shared`. C'est la
 * règle qui doit être unique, pas la boucle qui la lit.
 */
export function currentWeek(plan: PlanDto | null | undefined, today: string): PlanWeekDto | null {
  if (plan == null) return null;
  return (
    plan.weeks.find((week) => isDateInPlanWeek(plan.startDate, week.weekNumber, today)) ?? null
  );
}

/**
 * Quelle semaine afficher : celle demandée par l'URL si elle existe, sinon celle d'aujourd'hui,
 * sinon la première du cycle.
 *
 * Le repli sur la première semaine n'est PAS un fallback silencieux — il vient avec
 * `isOutOfCycle`, qui dit que le cycle n'a pas cours (pas encore commencé, ou terminé). Sans ce
 * drapeau, un cycle fini s'afficherait comme s'il était en train.
 */
export function resolveShownWeek(
  plan: PlanDto,
  today: string,
  requestedNumber: number | undefined,
): { week: PlanWeekDto | null; isOutOfCycle: boolean } {
  const requested =
    requestedNumber == null
      ? null
      : (plan.weeks.find((week) => week.weekNumber === requestedNumber) ?? null);
  const current = currentWeek(plan, today);
  return { week: requested ?? current ?? plan.weeks[0] ?? null, isOutOfCycle: current == null };
}
