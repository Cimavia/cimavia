import type {
  AthleteSheetDto,
  CoachAthleteDto,
  CreateInvitationInput,
  InvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi, athleteKeys, invitationKeys } from "@/feature/athlete/api";

// Les athlètes du coach courant (relations ACTIVE). Cache persisté, comme le reste du mobile.
export function useAthletes() {
  return useQuery<CoachAthleteDto[]>({
    queryKey: athleteKeys.list(),
    queryFn: accountApi.listAthletes,
  });
}

// Les invitations émises par le coach, les plus récentes d'abord (ordre imposé par l'API).
export function useInvitations() {
  return useQuery<InvitationDto[]>({
    queryKey: invitationKeys.list(),
    queryFn: accountApi.listInvitations,
  });
}

/**
 * Émet une invitation. Corps vide = code générique, acceptable par n'importe quel athlète non
 * encore lié — c'est le cas d'usage du mobile, où l'on transmet le code de vive voix.
 */
export function useCreateInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateInvitationInput) => accountApi.createInvitation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
    },
  });
}

/**
 * La fiche de suivi d'un athlète. `null` tant que le coach n'a rien écrit — l'absence de fiche est
 * un état normal, pas une donnée manquante.
 */
export function useAthleteSheet(athleteId: string) {
  return useQuery<AthleteSheetDto | null>({
    queryKey: athleteKeys.sheet(athleteId),
    queryFn: () => accountApi.getAthleteSheet(athleteId),
  });
}

// PUT et non PATCH : la fiche est UN champ texte libre, remplacé en entier. Rien à fusionner.
export function useSaveAthleteSheet(athleteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => accountApi.saveAthleteSheet(athleteId, { content }),
    onSuccess: (sheet) => {
      queryClient.setQueryData(athleteKeys.sheet(athleteId), sheet);
    },
  });
}
