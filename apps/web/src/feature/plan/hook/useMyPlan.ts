import type { PlanDto, ScheduledSessionDto } from "@cmv/shared";
import { myPlanKeys } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { athletePlanApi } from "@/feature/plan/api";

/**
 * Les cycles diffusés que l'athlète voit — au PLURIEL depuis #172, où ils ont cessé de se
 * remplacer les uns les autres. Liste vide s'il n'en a aucun ; le `null` du hook reste celui de la
 * requête (chargement, panne), que l'écran traite à part.
 *
 * Une seule requête porte les trois écrans athlète (planning, séances, détail) : les cycles
 * embarquent déjà leurs semaines et leurs séances. Le détail d'une séance, lui, demande sa propre
 * requête — c'est lui qui porte les exercices et leurs documents.
 */
export function useMyPlans() {
  return useQuery<PlanDto[]>({
    queryKey: myPlanKeys.visible(),
    queryFn: athletePlanApi.visible,
  });
}

// Détail d'une séance : exercices, consignes, documents (URLs signées, donc réseau requis).
export function useMyScheduledSession(sessionId: string) {
  return useQuery<ScheduledSessionDto>({
    queryKey: myPlanKeys.session(sessionId),
    queryFn: () => athletePlanApi.session(sessionId),
  });
}
