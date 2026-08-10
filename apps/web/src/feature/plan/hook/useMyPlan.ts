import type { PlanDto, ScheduledSessionDto } from "@cmv/shared";
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
