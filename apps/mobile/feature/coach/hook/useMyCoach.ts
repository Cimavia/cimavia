import {
  acceptInvitationMutation,
  type CoachAthleteDto,
  endRelationMutation,
  type PendingInvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, coachKeys, invitationKeys } from "@/feature/coach/api";

/**
 * Les coachs de l'athlète courant (#599), les plus récemment rejoints d'abord, ceux qu'il a quittés
 * compris (#909) : c'est à l'écran de les ranger à part (`splitFollows`). Liste vide = athlète
 * autonome : ce n'est pas une erreur, l'autonomie est un état prévu du modèle.
 */
export function useMyCoaches() {
  return useQuery<CoachAthleteDto[]>({
    queryKey: coachKeys.list(),
    queryFn: accountApi.myCoaches,
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
 * Quitte l'un de ses coachs (#911). La mutation et ce qu'elle fait au cache viennent de
 * `@cmv/shared`, celles du web (#910) : le lien rompu passe aussitôt dans la liste, puis tout se
 * relit — cycles, séances et fil du couple passent en lecture. Pas de toast sur mobile : l'échec se
 * dit sur la carte, et le succès se voit, la carte passant dans « Anciens coachs ».
 */
export function useLeaveCoach() {
  return useMutation(endRelationMutation(useQueryClient(), accountApi, "athlete"));
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
    mutationFn: (invitationId: string) => accountApi.declineInvitation(invitationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: invitationKeys.all });
    },
  });
}
