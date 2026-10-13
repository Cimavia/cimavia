import type { CreatePlanInput, PlanSummaryDto } from "@cmv/shared";
import { myPlanKeys } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoiceKeys } from "@/feature/invoice/api";
import { createPlan, deletePlan, listPlans, planKeys, publishPlan } from "@/feature/plan/api";
import { forgetPlanClipboardSource } from "@/feature/plan/hook/usePlanClipboard";
import { useStaleWriteError } from "@/feature/plan/hook/useStaleWriteError";
import { useMutationToast } from "@/shared/hook/useMutationToast";

// Le cycle visé, et la version que l'écran en montrait (#604).
type PlanAtVersion = { planId: string; expectedUpdatedAt: string };

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

/**
 * Diffuser ou supprimer depuis un écran périmé (#604) — un autre Coach a retouché, réaffecté ou
 * diffusé le cycle entre-temps. Le cycle se relit, et avec lui ce qu'une réaffectation ou une
 * diffusion a pu changer : sa facture, et la vue athlète en auto-coaching (#14).
 */
function usePlanActionError() {
  const queryClient = useQueryClient();
  return useStaleWriteError("plan.toast.planStale", () =>
    Promise.all(
      [planKeys.all, invoiceKeys.all, myPlanKeys.all].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    ),
  );
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  const onError = usePlanActionError();
  return useMutation({
    mutationFn: ({ planId, ...query }: PlanAtVersion) => deletePlan(planId, query),
    onSuccess: (_result, { planId }) => {
      // Une semaine copiée dans ce cycle ne peut plus se coller nulle part (#341).
      forgetPlanClipboardSource({ planId });
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      // La facture du cycle part en cascade (FK ON DELETE CASCADE) : rafraîchir la liste des
      // factures, sinon /invoices afficherait une facture qui n'existe plus en base.
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.onSuccess("plan.toast.deleted");
    },
    onError,
  });
}

// Diffusion : DRAFT → PUBLISHED. Irréversible (l'API refuse une seconde diffusion).
export function usePublishPlan() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  const onError = usePlanActionError();
  return useMutation({
    mutationFn: ({ planId, ...input }: PlanAtVersion) => publishPlan(planId, input),
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
    onError,
  });
}
