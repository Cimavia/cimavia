import type { CreateInvitationInput, InvitationDto } from "../dto/invitation.schema";
import type {
  OrganizationCoachDto,
  PendingOrganizationInvitationDto,
} from "../dto/organization.schema";
import type { ApiClient } from "./client";

/**
 * Appels HTTP de l'entreprise (#601), partagés web ↔ mobile — par ses deux bouts, comme
 * `createAccountApi` : l'entreprise qui ajoute ses Coachs, le Coach qui répond à son invitation.
 *
 * Deux préfixes, parce que deux capacités : `/organization` est gardé `company`,
 * `/organization-invitations` est gardé `coach`. Un client qui appelle la moitié qui n'est pas la
 * sienne prend un 403.
 */
export const organizationKeys = {
  all: ["organization"] as const,
  coaches: () => ["organization", "coaches"] as const,
  invitations: () => ["organization", "invitations"] as const,
  /**
   * Les invitations d'entreprise qui attendent le Coach courant — sous la même racine que la liste
   * de l'entreprise, comme `invitationKeys.forMe` : c'est la même table, et un refus doit périmer
   * les deux d'un seul geste.
   */
  forMe: () => ["organization", "for-me"] as const,
};

export type OrganizationApi = {
  // ── Côté entreprise ────────────────────────────────────────────────────────
  /** Ses Coachs, le plus récent arrivé d'abord. Liste vide = aucun membre, un état normal. */
  listCoaches: () => Promise<OrganizationCoachDto[]>;
  /** Ses invitations, sauf celles qu'elle a retirées. */
  listInvitations: () => Promise<InvitationDto[]>;
  /**
   * Invite une adresse à rejoindre l'équipe. La réponse est la même que l'adresse ait un compte ou
   * non (#146) ; 409 seulement si elle est celle d'un membre, que l'entreprise voit déjà.
   */
  inviteCoach: (input: CreateInvitationInput) => Promise<InvitationDto>;
  /** Retire une invitation EN ATTENTE ; 409 sur tout autre état. */
  revokeInvitation: (invitationId: string) => Promise<void>;
  /** Efface une invitation REFUSÉE ; 409 sur tout autre état. */
  deleteInvitation: (invitationId: string) => Promise<void>;

  // ── Côté Coach ─────────────────────────────────────────────────────────────
  /** Les invitations d'entreprise qui attendent le Coach courant : en cours, à son adresse. */
  myInvitations: () => Promise<PendingOrganizationInvitationDto[]>;
  /** Rejoint l'entreprise. 409 s'il en est déjà membre ; 404 si elle ne vise pas son adresse. */
  acceptInvitation: (invitationId: string) => Promise<void>;
  /** Refuse l'invitation. Sans retour : l'entreprise devra réinviter. */
  declineInvitation: (invitationId: string) => Promise<void>;
};

export function createOrganizationApi(api: ApiClient): OrganizationApi {
  return {
    listCoaches: () => api.get<OrganizationCoachDto[]>("/organization/coaches"),
    listInvitations: () => api.get<InvitationDto[]>("/organization/invitations"),
    inviteCoach: (input) => api.post<InvitationDto>("/organization/invitations", input),
    revokeInvitation: (invitationId) =>
      api.post<void>(`/organization/invitations/${invitationId}/revoke`),
    deleteInvitation: (invitationId) =>
      api.delete<void>(`/organization/invitations/${invitationId}`),

    myInvitations: () =>
      api.get<PendingOrganizationInvitationDto[]>("/organization-invitations/for-me"),
    acceptInvitation: (invitationId) =>
      api.post<void>(`/organization-invitations/${invitationId}/accept`),
    declineInvitation: (invitationId) =>
      api.post<void>(`/organization-invitations/${invitationId}/decline`),
  };
}

/**
 * Rejoindre une entreprise, et ce que ça fait au cache — les options du `useMutation` des deux
 * clients, telles quelles.
 *
 * L'invalidation est **globale**, comme pour `acceptInvitationMutation` et pour la même raison :
 * devenir membre change ce que le Coach peut voir — les athlètes de l'entreprise le rejoignent
 * (#602), puis ce qu'on lui partage (#605). Énumérer les clés en oublierait une.
 */
export function acceptOrganizationInvitationMutation(
  cache: { invalidateQueries(): unknown },
  api: Pick<OrganizationApi, "acceptInvitation">,
) {
  return {
    mutationFn: (invitationId: string) => api.acceptInvitation(invitationId),
    onSuccess: () => {
      cache.invalidateQueries();
    },
  };
}
