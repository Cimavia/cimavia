import {
  type CreateInvitationInput,
  type InvitationDto,
  InvitationRole,
  InvitationStatus,
  normalizeEmail,
  type OrganizationCoachDto,
  required,
} from "@cmv/shared";
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import type { Invitation } from "@prisma/client";
import {
  INVITATION_TTL_DAYS,
  invitationExpiry,
  removeDeclined,
  revokePending,
} from "../../account/invitation.lifecycle";
import { toInvitationDto } from "../../account/invitation.mapper";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import { InvitationMailer } from "../../infra/mail/invitation.mailer";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { issuingOrganization, toOrganizationCoachDto } from "../organization.mapper";

/**
 * L'entreprise et son équipe (#601), vues par le compte Entreprise. Client TENANT seul : la
 * capacité `company` scope `OrganizationCoach` et `Invitation` sur l'entreprise courante — dont
 * l'id est celui du compte (#600). Une invitation émise par un Coach y est invisible.
 */
@Injectable()
export class OrganizationService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly users: UserDirectoryService,
    private readonly notifications: NotificationService,
    private readonly mailer: InvitationMailer,
  ) {}

  /** Ses Coachs, le plus récent arrivé d'abord. */
  async listCoaches(): Promise<OrganizationCoachDto[]> {
    const members = await this.db.organizationCoach.findMany({ orderBy: { createdAt: "desc" } });
    if (members.length === 0) return [];

    const contacts = await this.users.contactsByIds(members.map((member) => member.coachId));
    return members.map((member) => toOrganizationCoachDto(member, contacts));
  }

  /**
   * Ses invitations, sauf celles qu'elle a retirées : retirer est SON geste, comme pour le Coach
   * (#524). Les refusées restent, pour qu'elle sache qui a dit non et puisse solder la ligne.
   */
  async listInvitations(): Promise<InvitationDto[]> {
    const invitations = await this.db.invitation.findMany({
      where: { status: { not: InvitationStatus.REVOKED } },
      orderBy: { createdAt: "desc" },
    });
    return invitations.map(toInvitationDto);
  }

  /**
   * Invite une adresse à devenir Coach de l'entreprise, pour sept jours. `organizationId` est
   * injecté par le tenancy layer.
   *
   * **Le seul refus porte sur un membre** (409) : l'entreprise voit déjà l'adresse de ses membres
   * dans sa page Coachs, le lui dire n'apprend rien. Tout le reste répond à l'identique, que
   * l'adresse ait un compte ou non (#146) — voir `announce`.
   */
  async inviteCoach(input: CreateInvitationInput): Promise<InvitationDto> {
    const email = normalizeEmail(input.email);
    const member = await this.db.organizationCoach.findFirst({
      where: { coach: { email: { equals: email, mode: "insensitive" } } },
      select: { id: true },
    });
    if (member != null) {
      throw new ConflictException("Ce coach est déjà membre de ton entreprise");
    }

    const invitation = await this.db.invitation.create({
      data: { email, role: InvitationRole.COACH, expiresAt: invitationExpiry() },
    });
    await this.announce(invitation);
    return toInvitationDto(invitation);
  }

  /**
   * Prévenir l'invité — trois issues, et **la réponse HTTP est la même dans les trois** (#146) :
   * refuser à l'envoi dirait à l'entreprise qu'un compte existe à cette adresse.
   *
   * - **Compte Coach** : notification (centre + push). Il accepte depuis son tableau de bord.
   * - **Pas de compte** : e-mail, qui l'invite à s'inscrire en cochant « Je coache ».
   * - **Compte sans capacité Coach** — athlète seul, ou entreprise : RIEN. Il ne peut pas être
   *   invité par une entreprise : il ne voit pas l'invitation et ne peut pas l'accepter. Lui écrire
   *   l'enverrait vers une inscription qu'il a déjà faite.
   *
   * Aucune branche ne fait échouer la création : notifications et e-mails absorbent leurs pannes.
   */
  private async announce(invitation: Invitation): Promise<void> {
    const organizationId = issuingOrganization(invitation);
    const account = await this.users.accountByEmail(invitation.email);

    if (account == null) {
      // L'entreprise est l'acteur courant : son nom introuvable serait une incohérence, pas un
      // e-mail anonyme.
      const organizationName = required(
        (await this.users.namesByIds([organizationId])).get(organizationId),
        `[organization] entreprise introuvable pour l'invitation ${invitation.id}`,
      );
      await this.mailer.sendOrganizationInvitation({
        to: invitation.email,
        organizationName,
        expiresInDays: INVITATION_TTL_DAYS,
      });
      return;
    }

    if (account.isCoach) {
      await this.notifications.notifyOrganizationInvitationReceived({
        coachId: account.id,
        organizationId,
        invitationId: invitation.id,
      });
    }
  }

  /** Retire une invitation EN ATTENTE (#524) — celle d'un autre émetteur rend 404. */
  async revokeInvitation(id: string): Promise<void> {
    await revokePending(this.db.invitation, id);
  }

  /** Efface une invitation REFUSÉE (#146) — celle d'un autre émetteur rend 404. */
  async removeInvitation(id: string): Promise<void> {
    await removeDeclined(this.db.invitation, id);
  }
}
