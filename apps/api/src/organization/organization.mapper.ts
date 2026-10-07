import type { OrganizationCoachDto, PendingOrganizationInvitationDto } from "@cmv/shared";
import { required } from "@cmv/shared";
import type { Invitation, OrganizationCoach } from "@prisma/client";

/**
 * Un membre tel que l'entreprise le voit. Nom et adresse viennent d'une résolution séparée
 * (`UserDirectoryService.contactsByIds`), `User` étant hors scope tenant. Un membre introuvable
 * signale une donnée incohérente — la ligne `organization_coach` part avec le compte (`Cascade`) —,
 * pas une ligne à afficher en blanc (règle dure n°5).
 */
export function toOrganizationCoachDto(
  member: OrganizationCoach,
  contacts: Map<string, { name: string; email: string }>,
): OrganizationCoachDto {
  const contact = required(
    contacts.get(member.coachId),
    `[organization] coach introuvable pour le membre ${member.id}`,
  );
  return {
    coachId: member.coachId,
    name: contact.name,
    email: contact.email,
    joinedAt: member.createdAt.toISOString(),
  };
}

/**
 * L'invitation telle que le Coach la reçoit — mapping à part de `toInvitationDto`, comme
 * `toPendingInvitationDto` côté athlète : rien ne doit pouvoir y faire fuiter l'adresse ou
 * l'`organizationId`. Le nom de l'entreprise est celui de son compte (#600).
 */
export function toPendingOrganizationInvitationDto(
  invitation: Invitation & { organizationId: string },
  namesById: Map<string, string>,
): PendingOrganizationInvitationDto {
  return {
    id: invitation.id,
    organizationName: required(
      namesById.get(invitation.organizationId),
      `[organization] entreprise introuvable pour l'invitation ${invitation.id}`,
    ),
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

/**
 * L'entreprise qui émet une invitation de Coach. Le CHECK `invitation_coach_by_organization` la
 * garantit en base : son absence ici est une incohérence, pas un cas.
 */
export function issuingOrganization(invitation: Pick<Invitation, "id" | "organizationId">): string {
  return required(
    invitation.organizationId,
    `[organization] invitation de Coach sans entreprise : ${invitation.id}`,
  );
}
