import type {
  OrganizationAthleteDto,
  OrganizationCoachDto,
  PendingOrganizationInvitationDto,
} from "@cmv/shared";
import { required } from "@cmv/shared";
import type { Invitation, OrganizationAthlete, OrganizationCoach } from "@prisma/client";

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
 * Un athlète tel que l'entreprise le voit (#602). Ses Coachs se DÉDUISENT de l'équipe — `coachIds`,
 * dans l'ordre d'arrivée — et non de ses liens, que l'entreprise ne lit pas : tous, sauf lui-même
 * s'il en est un. Même contrat de nom que `toOrganizationCoachDto`.
 */
export function toOrganizationAthleteDto(
  member: OrganizationAthlete,
  coachIds: string[],
  contacts: Map<string, { name: string; email: string }>,
): OrganizationAthleteDto {
  const contact = required(
    contacts.get(member.athleteId),
    `[organization] athlète introuvable pour le membre ${member.id}`,
  );
  return {
    athleteId: member.athleteId,
    name: contact.name,
    email: contact.email,
    joinedAt: member.createdAt.toISOString(),
    coaches: coachIds
      .filter((coachId) => coachId !== member.athleteId)
      .map((coachId) => ({
        coachId,
        name: required(
          contacts.get(coachId),
          `[organization] coach introuvable pour l'athlète ${member.id}`,
        ).name,
      })),
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
 * L'entreprise qui émet une invitation lue ou créée par elle — ou celle d'une invitation de Coach,
 * que le CHECK `invitation_coach_by_organization` garantit en base. Son absence ici est une
 * incohérence, pas un cas.
 */
export function issuingOrganization(invitation: Pick<Invitation, "id" | "organizationId">): string {
  return required(
    invitation.organizationId,
    `[organization] invitation sans entreprise : ${invitation.id}`,
  );
}
