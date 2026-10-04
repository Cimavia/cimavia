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

// Une écriture sur les invitations du coach : sa liste est à relire. Pas de toast sur mobile —
// l'échec se dit sur place, par l'écran qui porte le geste.
function useInvitationMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invitationKeys.all });
    },
  });
}

/**
 * Émet une invitation vers une adresse : elle n'apparaîtra qu'au compte qui la porte (#390).
 */
export function useCreateInvitation() {
  return useInvitationMutation((input: CreateInvitationInput) =>
    accountApi.createInvitation(input),
  );
}

/**
 * Retire une invitation EN ATTENTE (#524) — partie à la mauvaise adresse, ou devenue sans objet.
 * Elle quitte la liste du coach ; son destinataire, s'il tente encore de l'accepter, lit
 * « retirée ».
 */
export function useRevokeInvitation() {
  return useInvitationMutation((invitationId: string) => accountApi.revokeInvitation(invitationId));
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
