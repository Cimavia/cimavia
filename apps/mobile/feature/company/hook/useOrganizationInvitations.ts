import {
  acceptOrganizationInvitationMutation,
  type PendingOrganizationInvitationDto,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { organizationApi, organizationKeys } from "@/feature/company/api";

/**
 * Les invitations d'entreprise qui attendent le Coach courant (#601). Liste vide et requête en
 * échec se taisent toutes deux : on n'annonce rien, et surtout pas « aucune invitation » sur une
 * API injoignable.
 */
export function useMyOrganizationInvitations() {
  return useQuery<PendingOrganizationInvitationDto[]>({
    queryKey: organizationKeys.forMe(),
    queryFn: organizationApi.myInvitations,
  });
}

/** Rejoint l'entreprise. L'invalidation globale vit avec la mutation, partagée avec le web. */
export function useAcceptOrganizationInvitation() {
  return useMutation(acceptOrganizationInvitationMutation(useQueryClient(), organizationApi));
}

/** Refuse l'invitation, sans retour : l'entreprise devra réinviter. */
export function useDeclineOrganizationInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) => organizationApi.declineInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    },
  });
}
