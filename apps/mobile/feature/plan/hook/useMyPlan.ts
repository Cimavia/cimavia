import type { PlanDto, ScheduledSessionDto } from "@cmv/shared";
import { myPlanKeys } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { athletePlanApi } from "@/feature/plan/api";

/**
 * Les cycles diffusés que l'athlète voit — au PLURIEL depuis #172, où ils ont cessé de se
 * remplacer les uns les autres. Liste vide s'il n'en a aucun ; le `null` du hook reste celui de la
 * requête, que l'écran distingue déjà (hors-ligne, le cache sert encore les cycles).
 */
export function useMyPlans() {
  return useQuery<PlanDto[]>({
    queryKey: myPlanKeys.visible(),
    queryFn: athletePlanApi.visible,
  });
}

export function useScheduledSession(sessionId: string) {
  return useQuery<ScheduledSessionDto>({
    queryKey: myPlanKeys.session(sessionId),
    queryFn: () => athletePlanApi.session(sessionId),
  });
}
