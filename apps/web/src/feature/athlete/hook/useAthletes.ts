import type {
  AthleteSheetDto,
  CoachAthleteDto,
  CreateInvitationInput,
  InvitationDto,
  UpdateAthleteSheetInput,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, athleteKeys, invitationKeys } from "@/feature/athlete/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { isStaleWriteError } from "@/shared/lib/api";

export function useAthletes() {
  return useQuery<CoachAthleteDto[]>({
    queryKey: athleteKeys.list(),
    queryFn: accountApi.listAthletes,
  });
}

export function useAthleteSheet(athleteId: string) {
  return useQuery<AthleteSheetDto | null>({
    queryKey: athleteKeys.sheet(athleteId),
    queryFn: () => accountApi.getAthleteSheet(athleteId),
  });
}

/**
 * Un conflit d'édition (#440) ne passe pas par le toast : le panneau le dit à côté de la saisie, avec
 * de quoi recharger — un toast disparaîtrait en emportant la seule explication.
 */
export function useSaveAthleteSheet(athleteId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (input: UpdateAthleteSheetInput) => accountApi.saveAthleteSheet(athleteId, input),
    // La fiche RENDUE va en cache, version comprise : le panneau se ferme, la requête n'a plus
    // d'observateur, et une invalidation ne la relirait pas — rouvert, il citerait la version
    // d'avant et prendrait l'enregistrement du coach pour un conflit.
    onSuccess: (sheet) => {
      queryClient.setQueryData(athleteKeys.sheet(athleteId), sheet);
      toast.onSuccess("athlete.toast.sheetSaved");
    },
    onError: (error) => {
      if (!isStaleWriteError(error)) toast.onError(error);
    },
  });
}

export function useInvitations() {
  return useQuery<InvitationDto[]>({
    queryKey: invitationKeys.list(),
    queryFn: accountApi.listInvitations,
  });
}

/**
 * Une écriture sur les invitations du coach : relire sa liste, puis le dire. Un 409 remonte tel
 * quel par `onError` — le message du serveur est plus précis que tout libellé générique.
 */
function useInvitationMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  successKey: string,
) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      toast.onSuccess(successKey);
    },
    onError: toast.onError,
  });
}

/**
 * Efface une invitation REFUSÉE (#146). L'API n'accepte ce geste que sur `DECLINED` : retirer une
 * invitation en attente est une révocation, l'autre transition ci-dessous.
 */
export function useDeleteInvitation() {
  return useInvitationMutation(
    (invitationId: string) => accountApi.deleteInvitation(invitationId),
    "athlete.toast.invitationDeleted",
  );
}

/**
 * Retire une invitation EN ATTENTE (#524) — partie à la mauvaise adresse, ou devenue sans objet.
 * Elle quitte la liste du coach ; son destinataire, s'il tente encore de l'accepter, lit
 * « retirée ».
 */
export function useRevokeInvitation() {
  return useInvitationMutation(
    (invitationId: string) => accountApi.revokeInvitation(invitationId),
    "athlete.toast.invitationRevoked",
  );
}

export function useCreateInvitation() {
  return useInvitationMutation(
    (input: CreateInvitationInput) => accountApi.createInvitation(input),
    "athlete.toast.invitationCreated",
  );
}
