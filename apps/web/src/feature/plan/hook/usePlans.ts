import type { CoachAthleteDto, CreatePlanInput, PlanSummaryDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  athleteKeys,
  createPlan,
  deletePlan,
  listAthletes,
  listPlans,
  planKeys,
  publishPlan,
} from "@/feature/plan/api";

export function useAthletes() {
  return useQuery<CoachAthleteDto[]>({
    queryKey: athleteKeys.all,
    queryFn: listAthletes,
  });
}

export function usePlans() {
  return useQuery<PlanSummaryDto[]>({
    queryKey: planKeys.list(),
    queryFn: listPlans,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlanInput) => createPlan(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => deletePlan(planId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });
}

// Diffusion : DRAFT → PUBLISHED. Irréversible (l'API refuse une seconde diffusion).
export function usePublishPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => publishPlan(planId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });
}
