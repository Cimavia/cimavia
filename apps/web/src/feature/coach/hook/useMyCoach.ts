import type { AcceptInvitationInput, CoachAthleteDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, coachKeys } from "@/feature/coach/api";

// `null` = athlète sans coach. Ce n'est pas une erreur : l'autonomie est un état prévu du modèle
// (relation nullable et réversible dès P1).
export function useMyCoach() {
  return useQuery<CoachAthleteDto | null>({
    queryKey: coachKeys.mine(),
    queryFn: accountApi.myCoach,
  });
}

/**
 * Rejoint un coach par code d'invitation.
 *
 * L'invalidation est **globale**, comme au clic sur une notification et pour la même raison en plus
 * fort : rejoindre un coach ne change pas une donnée, il change *tout ce que l'athlète peut voir*.
 * Ses factures, sa planification, sa messagerie n'existaient pas une seconde plus tôt — et chaque
 * `null` déjà en cache (« aucune facture ») serait resservi jusqu'à expiration. Énumérer les clés
 * concernées coûterait plus cher que de tout refetcher après un geste qu'on ne fait qu'une fois.
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AcceptInvitationInput) => accountApi.acceptInvitation(input),
    onSuccess: (relation) => {
      queryClient.setQueryData(coachKeys.mine(), relation);
      queryClient.invalidateQueries();
    },
  });
}
