import type {
  AcceptInvitationInput,
  CoachAthleteDto,
  DeclineInvitationInput,
  PendingInvitationDto,
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
 * Rejoint un coach par code d'invitation.
 *
 * L'invalidation est **globale**, comme sur le web et comme au toucher d'une notification :
 * rejoindre un coach ne change pas une donnée, il change *tout ce que l'athlète peut voir*. Sa
 * planification, ses factures, sa messagerie n'existaient pas une seconde plus tôt, et chaque
 * réponse déjà en cache (« aucun coach », « aucune facture ») serait resservie jusqu'à expiration
 * — la carte de l'invitation acceptée comprise, qui resterait au-dessus du coach obtenu (#146).
 * L'énumération des clés avait oublié celle des contreparties, dont dépend la BARRE D'ONGLETS :
 * l'athlète qui venait de rejoindre n'avait pas d'onglet Messages avant d'avoir mis l'app en
 * arrière-plan (#308). Son `staleTime: 0` n'y pouvait rien — l'observateur vit dans
 * `app/(app)/_layout.tsx`, qui reste monté sous `join` : rien ne le remonte, seule une
 * invalidation relance la requête. Énumérer coûterait plus cher que de tout refetcher après un
 * geste qu'on ne fait qu'une fois.
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
