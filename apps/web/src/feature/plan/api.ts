import type {
  CoachAthleteDto,
  CreatePlanInput,
  CreateScheduledSessionInput,
  PlanDto,
  PlanSummaryDto,
  PlanWeekInput,
  ScheduledSessionDto,
  UpdatePlanInput,
  UpdatePlanWeekInput,
  UpdateScheduledSessionInput,
} from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Clés de cache TanStack Query — une racine `plans` pour tout invalider après une écriture.
export const planKeys = {
  all: ["plans"] as const,
  list: () => ["plans", "list"] as const,
  detail: (planId: string) => ["plans", "detail", planId] as const,
};

// Racine distincte : une séance planifiée n'est PAS un plan — mêmes clés = cache écrasé.
export const scheduledSessionKeys = {
  all: ["scheduled-sessions"] as const,
  detail: (sessionId: string) => ["scheduled-sessions", "detail", sessionId] as const,
};

export const athleteKeys = {
  all: ["athletes"] as const,
};

// Les athlètes du coach (relation + noms) — de quoi choisir le destinataire d'un cycle.
export function listAthletes(): Promise<CoachAthleteDto[]> {
  return api.get<CoachAthleteDto[]>("/athletes");
}

// ── Cycles ───────────────────────────────────────────────────────────────────

export function listPlans(): Promise<PlanSummaryDto[]> {
  return api.get<PlanSummaryDto[]>("/plans");
}

export function getPlan(planId: string): Promise<PlanDto> {
  return api.get<PlanDto>(`/plans/${planId}`);
}

export function createPlan(input: CreatePlanInput): Promise<PlanDto> {
  return api.post<PlanDto>("/plans", input);
}

export function updatePlan(planId: string, input: UpdatePlanInput): Promise<PlanDto> {
  return api.patch<PlanDto>(`/plans/${planId}`, input);
}

export function deletePlan(planId: string): Promise<void> {
  return api.delete<void>(`/plans/${planId}`);
}

// Diffusion : le cycle devient visible de l'athlète (et lui est notifié).
export function publishPlan(planId: string): Promise<PlanDto> {
  return api.post<PlanDto>(`/plans/${planId}/publish`);
}

// ── Semaines ─────────────────────────────────────────────────────────────────
// Les mutations de semaine renvoient le PLAN complet : le builder n'a pas à recomposer l'arbre.

export function addPlanWeek(planId: string, input: PlanWeekInput): Promise<PlanDto> {
  return api.post<PlanDto>(`/plans/${planId}/weeks`, input);
}

export function updatePlanWeek(weekId: string, input: UpdatePlanWeekInput): Promise<PlanDto> {
  return api.patch<PlanDto>(`/plan-weeks/${weekId}`, input);
}

export function deletePlanWeek(weekId: string): Promise<PlanDto> {
  return api.delete<PlanDto>(`/plan-weeks/${weekId}`);
}

// ── Séances planifiées ───────────────────────────────────────────────────────

export function createScheduledSession(
  weekId: string,
  input: CreateScheduledSessionInput,
): Promise<ScheduledSessionDto> {
  return api.post<ScheduledSessionDto>(`/plan-weeks/${weekId}/sessions`, input);
}

// PUT : titre, consignes, date ET composition sont remplacés intégralement (replace-all).
export function updateScheduledSession(
  sessionId: string,
  input: UpdateScheduledSessionInput,
): Promise<ScheduledSessionDto> {
  return api.put<ScheduledSessionDto>(`/scheduled-sessions/${sessionId}`, input);
}

export function getScheduledSession(sessionId: string): Promise<ScheduledSessionDto> {
  return api.get<ScheduledSessionDto>(`/scheduled-sessions/${sessionId}`);
}

export function deleteScheduledSession(sessionId: string): Promise<void> {
  return api.delete<void>(`/scheduled-sessions/${sessionId}`);
}
