import type { AcceptInvitationInput, CoachAthleteDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, coachKeys } from "@/feature/coach/api";
import { myPlanKeys } from "@/feature/plan/api";

export function useMyCoach() {
  return useQuery<CoachAthleteDto | null>({
    queryKey: coachKeys.mine(),
    queryFn: accountApi.myCoach,
  });
}

/**
 * Rejoint un coach par code d'invitation.
 *
 * Rejoindre change tout ce que l'athlète peut voir : on invalide donc aussi sa planification,
 * dont le `null` mis en cache (« aucun coach ») serait sinon resservi jusqu'à expiration.
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AcceptInvitationInput) => accountApi.acceptInvitation(input),
    onSuccess: (relation) => {
      queryClient.setQueryData(coachKeys.mine(), relation);
      queryClient.invalidateQueries({ queryKey: myPlanKeys.all });
    },
  });
}
