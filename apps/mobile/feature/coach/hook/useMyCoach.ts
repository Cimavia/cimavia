import {
  acceptInvitationMutation,
  type CoachAthleteDto,
  type DeclineInvitationInput,
  type PendingInvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, coachKeys, invitationKeys } from "@/feature/coach/api";

export function useMyCoach() {
  return useQuery<CoachAthleteDto | null>({
    queryKey: coachKeys.mine(),
    queryFn: accountApi.myCoach,
  });
}

/**
 * Rejoint un coach depuis la carte de son invitation. L'invalidation est globale : rejoindre change tout ce
 * que l'athlète peut voir — le pourquoi vit avec la mutation, partagée (#308).
 */
export function useAcceptInvitation() {
  return useMutation(acceptInvitationMutation(useQueryClient(), accountApi));
}

/**
 * Les invitations qui attendent l'athlète courant (#146).
 *
 * Liste vide et requête en échec ne se confondent pas — mais ici les deux se taisent : on
 * n'annonce rien, et surtout on n'écrit jamais « aucune invitation » sur une API injoignable.
 */
export function useMyInvitations() {
  return useQuery<PendingInvitationDto[]>({
    queryKey: invitationKeys.forMe(),
    queryFn: accountApi.myInvitations,
  });
}

/**
 * Refuse une invitation. Le geste est SANS RETOUR : le coach devra réémettre.
 *
 * L'invalidation vise `invitationKeys.all` seul, bien plus étroitement que l'acceptation : refuser
 * ne change rien à ce que l'athlète peut voir — ni cycle, ni facture n'apparaît.
 */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: DeclineInvitationInput) => accountApi.declineInvitation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
    },
  });
}
