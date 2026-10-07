import {
  acceptOrganizationInvitationMutation,
  type CreateInvitationInput,
  type InvitationDto,
  type InvitationRole,
  type OrganizationCoachDto,
  type PendingOrganizationInvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationApi, organizationKeys } from "@/feature/company/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

// ── Côté entreprise ──────────────────────────────────────────────────────────

/** Les Coachs de l'entreprise courante. Liste vide = aucun membre, un état prévu. */
export function useOrganizationCoaches() {
  return useQuery<OrganizationCoachDto[]>({
    queryKey: organizationKeys.coaches(),
    queryFn: organizationApi.listCoaches,
  });
}

/**
 * Ses invitations d'un rôle (#602), sauf celles qu'elle a retirées : en attente, refusées,
 * acceptées.
 */
export function useOrganizationInvitations(role: InvitationRole) {
  return useQuery<InvitationDto[]>({
    queryKey: organizationKeys.invitations(role),
    queryFn: () => organizationApi.listInvitations(role),
  });
}

/**
 * Une écriture de l'entreprise sur ses invitations : relire, puis le dire. La racine entière est
 * périmée et non la seule liste d'invitations — c'est la même que celle des membres, et un 409
 * « déjà membre » dit justement que les deux listes ont bougé ensemble.
 */
function useOrganizationMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  successKey: string,
) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
      toast.onSuccess(successKey);
    },
    onError: toast.onError,
  });
}

export function useInviteCoach() {
  return useOrganizationMutation(
    (input: CreateInvitationInput) => organizationApi.inviteCoach(input),
    "company.coaches.toast.invited",
  );
}

/** Retire une invitation EN ATTENTE : son destinataire, s'il tente encore, lit « retirée ». */
export function useRevokeCoachInvitation() {
  return useOrganizationMutation(
    (invitationId: string) => organizationApi.revokeInvitation(invitationId),
    "company.coaches.toast.revoked",
  );
}

/** Efface une invitation REFUSÉE — le seul état qui s'efface. */
export function useDeleteCoachInvitation() {
  return useOrganizationMutation(
    (invitationId: string) => organizationApi.deleteInvitation(invitationId),
    "company.coaches.toast.deleted",
  );
}

// ── Côté Coach ───────────────────────────────────────────────────────────────

/**
 * Les invitations d'entreprise qui attendent le Coach courant. Une requête en échec ne s'annonce
 * pas : l'absence d'invitation est le cas ordinaire, un bandeau d'erreur pour elle inquiéterait
 * sans rien apprendre — même parti que `useMyInvitations` côté athlète.
 */
export function useMyOrganizationInvitations() {
  return useQuery<PendingOrganizationInvitationDto[]>({
    queryKey: organizationKeys.forMe(),
    queryFn: organizationApi.myInvitations,
  });
}

/**
 * Rejoint l'entreprise. L'invalidation globale vit avec la mutation, partagée ; le toast s'y
 * ajoute, parce que la carte disparaît d'un coup et que rien d'autre ne dit que c'est fait.
 */
export function useAcceptOrganizationInvitation() {
  const toast = useMutationToast();
  const accept = acceptOrganizationInvitationMutation(useQueryClient(), organizationApi);
  return useMutation({
    mutationFn: accept.mutationFn,
    onSuccess: () => {
      accept.onSuccess();
      toast.onSuccess("coach.organizationInvitation.toast.accepted");
    },
    onError: toast.onError,
  });
}

/**
 * Refuse l'invitation, sans retour. La racine `organizationKeys.all` porte aussi la liste de
 * l'entreprise ; refuser ne change rien d'autre à ce que le Coach voit.
 */
export function useDeclineOrganizationInvitation() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();
  return useMutation({
    mutationFn: (invitationId: string) => organizationApi.declineInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
      toast.onSuccess("coach.organizationInvitation.toast.declined");
    },
    onError: toast.onError,
  });
}
