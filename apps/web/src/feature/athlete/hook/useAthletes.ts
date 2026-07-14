import type {
  AthleteSheetDto,
  CoachAthleteDto,
  CreateInvitationInput,
  InvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  athleteKeys,
  createInvitation,
  getAthleteSheet,
  invitationKeys,
  listAthletes,
  listInvitations,
  saveAthleteSheet,
} from "@/feature/athlete/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

export function useAthletes() {
  return useQuery<CoachAthleteDto[]>({
    queryKey: athleteKeys.list(),
    queryFn: listAthletes,
  });
}

export function useAthleteSheet(athleteId: string) {
  return useQuery<AthleteSheetDto | null>({
    queryKey: athleteKeys.sheet(athleteId),
    queryFn: () => getAthleteSheet(athleteId),
  });
}

export function useSaveAthleteSheet(athleteId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (content: string) => saveAthleteSheet(athleteId, { content }),
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
    queryFn: listInvitations,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (input: CreateInvitationInput) => createInvitation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      toast.onSuccess("athlete.toast.invitationCreated");
    },
    onError: toast.onError,
  });
}
