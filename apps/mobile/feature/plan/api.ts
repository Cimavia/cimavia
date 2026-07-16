import type { PlanDto, ScheduledSessionDto } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Clés de cache — ce sont elles qui sont persistées sur le disque (lecture hors-ligne).
export const planKeys = {
  all: ["plan"] as const,
  current: () => ["plan", "current"] as const,
};

export const scheduledSessionKeys = {
  all: ["scheduled-sessions"] as const,
  detail: (sessionId: string) => ["scheduled-sessions", "detail", sessionId] as const,
};

/**
 * Le cycle courant de l'athlète, avec ses semaines et ses séances — `null` s'il n'a aucun plan
 * diffusé. Une seule requête porte la vue Planning ET l'onglet Séances : c'est ce qui rend le
 * cache hors-ligne simple (un objet, une clé).
 */
export function getMyPlan(): Promise<PlanDto | null> {
  return api.get<PlanDto | null>("/me/plan");
}

// Détail d'une séance : exercices, consignes, documents (URLs signées, donc réseau requis).
export function getMyScheduledSession(sessionId: string): Promise<ScheduledSessionDto> {
  return api.get<ScheduledSessionDto>(`/me/scheduled-sessions/${sessionId}`);
}
