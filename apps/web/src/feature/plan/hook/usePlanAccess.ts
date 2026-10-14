import type { ChangeAccessInput, CoachOrganizationDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { changePlanAccess, listPlanOrganizations, planKeys } from "@/feature/plan/api";

/**
 * Les entreprises à qui le propriétaire peut ouvrir ce cycle (#607) : les siennes, réduites aux
 * Coachs qui suivent son athlète. Lue à l'ouverture du panneau seulement — `enabled` —, l'API
 * refusant la question à tout autre que le propriétaire.
 */
export function usePlanOrganizations(planId: string, enabled: boolean) {
  return useQuery<CoachOrganizationDto[]>({
    queryKey: planKeys.organizations(planId),
    queryFn: () => listPlanOrganizations(planId),
    enabled,
  });
}

/** Change les droits d'un cycle (#607) ; le cycle se relit avec ses nouveaux droits. */
export function useChangePlanAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeAccessInput) => changePlanAccess(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });
}
