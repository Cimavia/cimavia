import type {
  ChangeAccessInput,
  CoachOrganizationDto,
  CopyPlanWeekInput,
  CreatePlanInput,
  CreateScheduledSessionInput,
  ElementAccessDto,
  PlanDto,
  PlanSummaryDto,
  PlanWeekInput,
  PublishPlanInput,
  ReorderPlanDayInput,
  ScheduledCompositionInput,
  ScheduledSessionCopyDto,
  ScheduledSessionDto,
  UpdatePlanInput,
  UpdatePlanWeekInput,
  UpdateScheduledSessionInput,
  VersionQuery,
} from "@cmv/shared";
import { createAthletePlanApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Clés de cache TanStack Query — une racine `plans` pour tout invalider après une écriture.
export const planKeys = {
  all: ["plans"] as const,
  list: () => ["plans", "list"] as const,
  detail: (planId: string) => ["plans", "detail", planId] as const,
  // Sous la racine : changer les droits, réaffecter ou supprimer le cycle la rend périmée.
  organizations: (planId: string) => ["plans", "organizations", planId] as const,
};

// Racine distincte : une séance planifiée n'est PAS un plan — mêmes clés = cache écrasé.
export const scheduledSessionKeys = {
  all: ["scheduled-sessions"] as const,
  detail: (sessionId: string) => ["scheduled-sessions", "detail", sessionId] as const,
  // Sous la racine : toute écriture sur une séance du cycle peut changer une de ses copies.
  copies: (sessionId: string) => ["scheduled-sessions", "copies", sessionId] as const,
};

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

// Un DELETE n'a pas de corps : la version du cycle affiché voyage dans la requête (#604).
export function deletePlan(planId: string, query: VersionQuery): Promise<void> {
  return api.delete<void>(`/plans/${planId}?${new URLSearchParams(query)}`);
}

// Diffusion : le cycle devient visible de l'athlète (et lui est notifié). Elle cite la version du
// cycle affiché (#604) : réaffecté depuis, il ne part pas chez un athlète que l'écran ne montrait pas.
export function publishPlan(planId: string, input: PublishPlanInput): Promise<PlanDto> {
  return api.post<PlanDto>(`/plans/${planId}/publish`, input);
}

// ── Accès (#607) ─────────────────────────────────────────────────────────────

// Les entreprises à qui ouvrir le cycle, réduites aux Coachs de son athlète. Propriétaire seul.
export function listPlanOrganizations(planId: string): Promise<CoachOrganizationDto[]> {
  return api.get<CoachOrganizationDto[]>(`/plans/${planId}/organizations`);
}

export function changePlanAccess(input: ChangeAccessInput): Promise<ElementAccessDto[]> {
  return api.patch<ElementAccessDto[]>("/plans/access", input);
}

// ── Semaines ─────────────────────────────────────────────────────────────────
// Les mutations de semaine renvoient le PLAN complet : le builder n'a pas à recomposer l'arbre.

export function addPlanWeek(planId: string, input: PlanWeekInput): Promise<PlanDto> {
  return api.post<PlanDto>(`/plans/${planId}/weeks`, input);
}

export function updatePlanWeek(weekId: string, input: UpdatePlanWeekInput): Promise<PlanDto> {
  return api.patch<PlanDto>(`/plan-weeks/${weekId}`, input);
}

// Un DELETE n'a pas de corps : la version lue voyage dans la requête (#604).
export function deletePlanWeek(weekId: string, query: VersionQuery): Promise<PlanDto> {
  return api.delete<PlanDto>(`/plan-weeks/${weekId}?${new URLSearchParams(query)}`);
}

// Colle le contenu d'une autre semaine ICI : la cible est la ressource, la source voyage dans le
// corps. Aucune date n'est transmise — l'API les recalcule depuis le lundi de la semaine cible.
export function copyPlanWeek(targetWeekId: string, input: CopyPlanWeekInput): Promise<PlanDto> {
  return api.post<PlanDto>(`/plan-weeks/${targetWeekId}/copy-from`, input);
}

/**
 * L'ordre des séances d'UNE journée. La journée est la ressource — semaine et date vivent donc
 * dans l'URL — et le corps ne porte que l'ordre voulu, en entier : c'est une permutation, pas un
 * extrait (l'API refuse un sous-ensemble).
 */
export function reorderPlanDay(
  weekId: string,
  date: string,
  input: ReorderPlanDayInput,
): Promise<PlanDto> {
  return api.put<PlanDto>(`/plan-weeks/${weekId}/days/${date}/order`, input);
}

// ── Séances planifiées ───────────────────────────────────────────────────────

export function createScheduledSession(
  weekId: string,
  input: CreateScheduledSessionInput,
): Promise<ScheduledSessionDto> {
  return api.post<ScheduledSessionDto>(`/plan-weeks/${weekId}/sessions`, input);
}

// PUT : titre, consignes, date, et la composition quand elle est envoyée (replace-all).
export function updateScheduledSession(
  sessionId: string,
  input: UpdateScheduledSessionInput,
): Promise<ScheduledSessionDto> {
  return api.put<ScheduledSessionDto>(`/scheduled-sessions/${sessionId}`, input);
}

export function getScheduledSession(sessionId: string): Promise<ScheduledSessionDto> {
  return api.get<ScheduledSessionDto>(`/scheduled-sessions/${sessionId}`);
}

/** Les copies de la séance-type dans le cycle, la séance comprise (#720). */
export function getScheduledSessionCopies(sessionId: string): Promise<ScheduledSessionCopyDto[]> {
  return api.get<ScheduledSessionCopyDto[]>(`/scheduled-sessions/${sessionId}/copies`);
}

// Un changement de composition, écrit tout de suite sur les semaines choisies : rend les copies.
export function composeScheduledSession(
  sessionId: string,
  input: ScheduledCompositionInput,
): Promise<ScheduledSessionCopyDto[]> {
  return api.post<ScheduledSessionCopyDto[]>(`/scheduled-sessions/${sessionId}/composition`, input);
}

// « Tout réinitialiser » : la composition de la séance-type, pour cette semaine seule.
export function resetScheduledComposition(
  sessionId: string,
  query: VersionQuery,
): Promise<ScheduledSessionCopyDto[]> {
  return api.post<ScheduledSessionCopyDto[]>(
    `/scheduled-sessions/${sessionId}/composition/reset`,
    query,
  );
}

// Sans corps : la version de la séance ouverte voyage en paramètre de requête (#604).
export function deleteScheduledSession(sessionId: string, query: VersionQuery): Promise<void> {
  return api.delete<void>(`/scheduled-sessions/${sessionId}?${new URLSearchParams(query)}`);
}

// ── Lecture athlète ──────────────────────────────────────────────────────────
// Surface DISTINCTE de celle du coach ci-dessus : d'autres routes (`/me/…`), d'autres gardes
// (`@Roles([ATHLETE])`), d'autres besoins — lire ce qu'on doit faire, contre composer ce qu'un
// autre fera. Les deux cohabitent dans cette feature comme elles cohabitent dans le module `plan/`
// de l'API (`plan.controller.ts` / `athlete-plan.controller.ts`).
export const athletePlanApi = createAthletePlanApi(api);

export { myPlanKeys } from "@cmv/shared";
