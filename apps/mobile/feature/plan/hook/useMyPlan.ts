import type { PlanDto, PlanWeekDto, ScheduledSessionDto } from "@cmv/shared";
import { isDateInPlanWeek, todayIsoDate } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { athletePlanApi, myPlanKeys } from "@/feature/plan/api";

export function useMyPlan() {
  return useQuery<PlanDto | null>({
    queryKey: myPlanKeys.current(),
    queryFn: athletePlanApi.current,
  });
}

export function useScheduledSession(sessionId: string) {
  return useQuery<ScheduledSessionDto>({
    queryKey: myPlanKeys.session(sessionId),
    queryFn: () => athletePlanApi.session(sessionId),
  });
}

// La semaine du cycle qui contient aujourd'hui, ou `null` si le cycle n'a pas (encore / plus)
// cours — pas de repli sur la semaine 1, qui afficherait un passé pour un présent.
export function currentWeek(plan: PlanDto | null | undefined): PlanWeekDto | null {
  if (plan == null) return null;
  const today = todayIsoDate();
  return (
    plan.weeks.find((week) => isDateInPlanWeek(plan.startDate, week.weekNumber, today)) ?? null
  );
}
