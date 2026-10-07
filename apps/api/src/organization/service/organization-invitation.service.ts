import {
  InvitationRole,
  InvitationStatus,
  type PendingOrganizationInvitationDto,
} from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { assertActionable, pendingFor } from "../../account/invitation.lifecycle";
import { OrganizationLinkService } from "../../account/service/organization-link.service";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { issuingOrganization, toPendingOrganizationInvitationDto } from "../organization.mapper";

/**
 * Le Coach face à l'invitation d'une entreprise (#601) : la voir, l'accepter, la refuser.
 *
 * Client de BASE, comme les trois gestes de l'athlète dans `InvitationService` : le Coach invité
 * n'est l'émetteur d'aucune de ces lignes, il n'est donc pas l'acteur d'un scope de `Invitation`.
 * Le verrou est l'adresse de sa session, et le rôle `COACH` — jamais un paramètre.
 *
 * Les trois routes exigent la capacité Coach (`@RequireCapability("coach")`) : un compte athlète
 * seul ou un compte Entreprise invité par erreur reçoit 403, et ne voit jamais l'invitation.
 */
@Injectable()
export class OrganizationInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserDirectoryService,
    private readonly links: OrganizationLinkService,
  ) {}

  /** Les invitations d'entreprise qui attendent ce Coach : en cours, non expirées, à son adresse. */
  async listForMe(coach: { email: string }): Promise<PendingOrganizationInvitationDto[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: pendingFor(coach.email, InvitationRole.COACH),
      orderBy: { createdAt: "desc" },
    });
    if (invitations.length === 0) return [];

    const owned = invitations.map((invitation) => ({
      ...invitation,
      organizationId: issuingOrganization(invitation),
    }));
    const names = await this.users.namesByIds(owned.map((invitation) => invitation.organizationId));
    return owned.map((invitation) => toPendingOrganizationInvitationDto(invitation, names));
  }

  private async findActionable(coach: { email: string }, id: string) {
    const invitation = assertActionable(
      await this.prisma.invitation.findUnique({ where: { id } }),
      {
        email: coach.email,
        role: InvitationRole.COACH,
        revokedMessage: "Invitation retirée par l'entreprise",
      },
    );
    return { ...invitation, organizationId: issuingOrganization(invitation) };
  }

  /**
   * Rejoint l'entreprise, et suit chacun de ses athlètes (#602) — voir `coachJoins`, qui porte les
   * règles des liens et la transaction.
   */
  async accept(coach: { id: string; email: string }, id: string): Promise<void> {
    const invitation = await this.findActionable(coach, id);
    await this.links.coachJoins(coach, {
      id: invitation.id,
      organizationId: invitation.organizationId,
    });
  }

  /**
   * Refuse l'invitation. L'entreprise le voit dans sa liste, où la ligne reste jusqu'à ce qu'elle
   * l'efface ; aucune notification ne part — le compte Entreprise n'en reçoit pas en v1.
   */
  async decline(coach: { email: string }, id: string): Promise<void> {
    const invitation = await this.findActionable(coach, id);
    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.DECLINED },
    });
  }
}
