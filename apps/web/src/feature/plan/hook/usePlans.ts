import type { CreatePlanInput, PlanSummaryDto } from "@cmv/shared";
import { myPlanKeys } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoiceKeys } from "@/feature/invoice/api";
import { createPlan, deletePlan, listPlans, planKeys, publishPlan } from "@/feature/plan/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

export function usePlans() {
  return useQuery<PlanSummaryDto[]>({
    queryKey: planKeys.list(),
    queryFn: listPlans,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (input: CreatePlanInput) => createPlan(input),
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      toast.onSuccess("plan.toast.created", { title: plan.title });
    },
    onError: toast.onError,
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (planId: string) => deletePlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      // La facture du cycle part en cascade (FK ON DELETE CASCADE) : rafraîchir la liste des
      // factures, sinon /invoices afficherait une facture qui n'existe plus en base.
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.onSuccess("plan.toast.deleted");
    },
    onError: toast.onError,
  });
}

// Diffusion : DRAFT → PUBLISHED. Irréversible (l'API refuse une seconde diffusion).
export function usePublishPlan() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (planId: string) => publishPlan(planId),
    onSuccess: (plan) => {
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      // La diffusion émet la facture (DRAFT → PENDING) : rafraîchir la liste des factures et le
      // brouillon du cycle, sinon /invoices resterait vide jusqu'à un rechargement manuel.
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      // Le cycle diffusé se lit par les routes ATHLÈTE, et en auto-coaching c'est le MÊME cache
      // (#14) : sans cette invalidation, le compte bascule côté athlète et n'y voit rien pendant
      // une minute (`staleTime`). Sans effet pour un coach pur, dont le cache n'a pas cette clé.
      queryClient.invalidateQueries({ queryKey: myPlanKeys.all });
      toast.onSuccess("plan.toast.published", { title: plan.title });
    },
    onError: toast.onError,
  });
}
