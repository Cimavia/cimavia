import type {
  AcceptInvitationInput,
  CoachAthleteDto,
  DeclineInvitationInput,
  PendingInvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, coachKeys, invitationKeys } from "@/feature/coach/api";
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
      // L'invitation acceptée n'attend plus personne : sans cette invalidation, sa carte resterait
      // affichée au-dessus du « tu as déjà un coach » qu'on vient d'obtenir (#146).
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
    },
  });
}

/**
 * Les invitations qui attendent l'athlète courant (#146).
 *
 * Liste vide et requête en échec ne se confondent pas — mais ici les deux se taisent : on
 * n'annonce rien, et surtout on n'écrit jamais « aucune invitation » sur une API injoignable.
 * L'écran reste utilisable, le formulaire de code est dessous.
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
