import type {
  CreateScheduledSessionInput,
  PlanDto,
  PlanWeekInput,
  UpdatePlanWeekInput,
  UpdateScheduledSessionInput,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addPlanWeek,
  createScheduledSession,
  deletePlanWeek,
  deleteScheduledSession,
  getPlan,
  planKeys,
  scheduledSessionKeys,
  updatePlanWeek,
  updateScheduledSession,
} from "@/feature/plan/api";

export function usePlan(planId: string) {
  return useQuery<PlanDto>({
    queryKey: planKeys.detail(planId),
    queryFn: () => getPlan(planId),
  });
}

/**
 * Écritures du builder. Toutes invalident les DEUX racines : `plans` (le détail du cycle et les
 * compteurs de la liste) et `scheduled-sessions` (le détail d'une instance ouverte). Sans quoi le
 * panneau rouvert afficherait la composition d'avant l'enregistrement.
 */
export function usePlanMutations(planId: string) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: planKeys.all });
    await queryClient.invalidateQueries({ queryKey: scheduledSessionKeys.all });
  };

  const addWeek = useMutation({
    mutationFn: (input: PlanWeekInput) => addPlanWeek(planId, input),
    onSuccess: invalidate,
  });

  const updateWeek = useMutation({
    mutationFn: ({ weekId, input }: { weekId: string; input: UpdatePlanWeekInput }) =>
      updatePlanWeek(weekId, input),
    onSuccess: invalidate,
  });

  // Renumérote les semaines suivantes et fait remonter leurs séances d'une semaine (côté API).
  const removeWeek = useMutation({
    mutationFn: (weekId: string) => deletePlanWeek(weekId),
    onSuccess: invalidate,
  });

  const createSession = useMutation({
    mutationFn: ({ weekId, input }: { weekId: string; input: CreateScheduledSessionInput }) =>
      createScheduledSession(weekId, input),
    onSuccess: invalidate,
  });

  const saveSession = useMutation({
    mutationFn: ({ sessionId, input }: { sessionId: string; input: UpdateScheduledSessionInput }) =>
      updateScheduledSession(sessionId, input),
    onSuccess: invalidate,
  });

  const removeSession = useMutation({
    mutationFn: (sessionId: string) => deleteScheduledSession(sessionId),
    onSuccess: invalidate,
  });

  const isBusy =
    addWeek.isPending ||
    updateWeek.isPending ||
    removeWeek.isPending ||
    createSession.isPending ||
    saveSession.isPending ||
    removeSession.isPending;

  const error =
    addWeek.error ??
    updateWeek.error ??
    removeWeek.error ??
    createSession.error ??
    saveSession.error ??
    removeSession.error;

  return {
    addWeek,
    updateWeek,
    removeWeek,
    createSession,
    saveSession,
    removeSession,
    isBusy,
    error,
  };
}
