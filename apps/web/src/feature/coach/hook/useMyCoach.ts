import type {
  AcceptInvitationInput,
  CoachAthleteDto,
  DeclineInvitationInput,
  PendingInvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, coachKeys, invitationKeys } from "@/feature/coach/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

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

/**
 * Les invitations qui attendent l'athlète courant (#146).
 *
 * Liste vide et requête en échec ne se confondent pas, et c'est l'appelant qui en tire les
 * conséquences : on n'annonce rien dans les deux cas, mais on n'écrit jamais « aucune invitation »
 * sur une API injoignable — même raisonnement que l'état d'erreur de `MyCoachScreen`, qui refuse
 * d'afficher le formulaire de code quand il n'a pas pu lire.
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
    mutationFn: (input: DeclineInvitationInput) => accountApi.declineInvitation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      toast.onSuccess("coach.invitation.toast.declined");
    },
    onError: toast.onError,
  });
}
