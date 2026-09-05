import type {
  AthleteSheetDto,
  CoachAthleteDto,
  CreateInvitationInput,
  InvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, athleteKeys, invitationKeys } from "@/feature/athlete/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

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

export function useSaveAthleteSheet(athleteId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (content: string) => accountApi.saveAthleteSheet(athleteId, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: athleteKeys.sheet(athleteId) });
      toast.onSuccess("athlete.toast.sheetSaved");
    },
    onError: toast.onError,
  });
}

export function useInvitations() {
  return useQuery<InvitationDto[]>({
    queryKey: invitationKeys.list(),
    queryFn: accountApi.listInvitations,
  });
}

/**
 * Efface une invitation REFUSÉE (#146).
 *
 * L'API n'accepte ce geste que sur `DECLINED` : retirer une invitation en attente serait une
 * révocation, c'est-à-dire une autre transition. Un 409 remonte donc tel quel par `onError` — le
 * message du serveur est plus précis que tout libellé générique.
 */
export function useDeleteInvitation() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (invitationId: string) => accountApi.deleteInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      toast.onSuccess("athlete.toast.invitationDeleted");
    },
    onError: toast.onError,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) => accountApi.createInvitation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      toast.onSuccess("athlete.toast.invitationCreated");
    },
    onError: toast.onError,
  });
}
