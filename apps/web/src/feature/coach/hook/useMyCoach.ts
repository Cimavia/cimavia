import {
  acceptInvitationMutation,
  type CoachAthleteDto,
  type PendingInvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, coachKeys, invitationKeys } from "@/feature/coach/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

/**
 * Les coachs de l'athlète courant (#599), les plus récemment rejoints d'abord. Liste vide =
 * athlète autonome : ce n'est pas une erreur, l'autonomie est un état prévu du modèle.
 */
export function useMyCoaches() {
  return useQuery<CoachAthleteDto[]>({
    queryKey: coachKeys.list(),
    queryFn: accountApi.myCoaches,
  });
}

/**
 * Rejoint un coach depuis la carte de son invitation. L'invalidation est globale : rejoindre
 * change tout ce que l'athlète peut voir — le pourquoi vit avec la mutation, partagée (#308).
 *
 * L'échec se dit en toast, comme celui du refus : sans lui, le bouton repassait de « Connexion en
 * cours… » à « Rejoindre » et rien d'autre ne se passait (#365).
 */
export function useAcceptInvitation() {
  const toast = useMutationToast();
  return useMutation({
    ...acceptInvitationMutation(useQueryClient(), accountApi),
    onError: toast.onError,
  });
}

/**
 * Les invitations qui attendent l'athlète courant (#146).
 *
 * Liste vide et requête en échec ne se confondent pas, et c'est l'appelant qui en tire les
 * conséquences : on n'annonce rien dans les deux cas, mais on n'écrit jamais « aucune invitation »
 * sur une API injoignable — même raisonnement que l'état d'erreur de `MyCoachScreen`, qui refuse
 * de dire « aucun coach » quand il n'a pas pu lire.
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
 * L'invalidation vise `invitationKeys.all` et non la seule liste de l'athlète — la même racine
 * porte celle du coach, qu'un compte à double capacité tient peut-être en cache au même moment.
 * Elle reste bien plus étroite que celle de l'acceptation : refuser ne change rien à ce que
 * l'athlète peut voir, il n'y a pas de cycle ni de facture qui apparaisse.
 */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: (invitationId: string) => accountApi.declineInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      toast.onSuccess("coach.invitation.toast.declined");
    },
    onError: toast.onError,
  });
}
