import {
  type CreateOrganizationInvitationInput,
  type InvitationDto,
  InvitationRole,
  InvitationStatus,
  normalizeEmail,
  type OrganizationAthleteDto,
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
import {
  issuingOrganization,
  toOrganizationAthleteDto,
  toOrganizationCoachDto,
} from "../organization.mapper";

/**
 * L'entreprise, son équipe (#601) et ses athlètes (#602), vus par le compte Entreprise. Client
 * TENANT seul : la capacité `company` scope `OrganizationCoach`, `OrganizationAthlete` et
 * `Invitation` sur l'entreprise courante — dont l'id est celui du compte (#600). Une invitation
 * émise par un Coach y est invisible.
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
   * Ses athlètes (#602), le plus récent arrivé d'abord, chacun avec les Coachs qui le suivent —
   * déduits de l'équipe, voir `toOrganizationAthleteDto`.
   */
  async listAthletes(): Promise<OrganizationAthleteDto[]> {
    const members = await this.db.organizationAthlete.findMany({ orderBy: { createdAt: "desc" } });
    if (members.length === 0) return [];

    const coachIds = (
      await this.db.organizationCoach.findMany({
        orderBy: { createdAt: "asc" },
        select: { coachId: true },
      })
    ).map((coach) => coach.coachId);
    const contacts = await this.users.contactsByIds([
      ...members.map((member) => member.athleteId),
      ...coachIds,
    ]);
    return members.map((member) => toOrganizationAthleteDto(member, coachIds, contacts));
  }

  /**
   * Ses invitations d'un rôle (#602), sauf celles qu'elle a retirées : retirer est SON geste,
   * comme pour le Coach (#524). Les refusées restent, pour qu'elle sache qui a dit non et puisse
   * solder la ligne.
   */
  async listInvitations(role: InvitationRole): Promise<InvitationDto[]> {
    const invitations = await this.db.invitation.findMany({
      where: { role, status: { not: InvitationStatus.REVOKED } },
      orderBy: { createdAt: "desc" },
    });
    return invitations.map(toInvitationDto);
  }

  /**
   * Invite une adresse, pour sept jours : à devenir Coach de l'entreprise (#601), ou l'un de ses
   * athlètes, suivi par tous ses Coachs (#602). `organizationId` est injecté par le tenancy layer.
   *
   * **Le seul refus porte sur un membre du même rôle** (409) : l'entreprise voit déjà leurs
   * adresses dans sa page, le lui dire n'apprend rien. Tout le reste répond à l'identique, que
   * l'adresse ait un compte ou non (#146) — voir `announce`.
   */
  async invite(input: CreateOrganizationInvitationInput): Promise<InvitationDto> {
    const email = normalizeEmail(input.email);
    await this.assertNotMember(input.role, email);

    const invitation = await this.db.invitation.create({
      data: { email, role: input.role, expiresAt: invitationExpiry() },
    });
    await this.announce(invitation);
    return toInvitationDto(invitation);
  }

  private async assertNotMember(role: InvitationRole, email: string): Promise<void> {
    const sameEmail = { email: { equals: email, mode: "insensitive" } } as const;
    if (role === InvitationRole.COACH) {
      const coach = await this.db.organizationCoach.findFirst({
        where: { coach: sameEmail },
        select: { id: true },
      });
      if (coach != null) throw new ConflictException("Ce coach est déjà membre de ton entreprise");
      return;
    }
    const athlete = await this.db.organizationAthlete.findFirst({
      where: { athlete: sameEmail },
      select: { id: true },
    });
    if (athlete != null) {
      throw new ConflictException("Cet athlète est déjà suivi par ton entreprise");
    }
  }

  /**
   * Prévenir l'invité — trois issues, et **la réponse HTTP est la même dans les trois** (#146) :
   * refuser à l'envoi dirait à l'entreprise qu'un compte existe à cette adresse.
   *
   * - **Compte qui porte la capacité du rôle** : notification (centre + push). Un Coach accepte
   *   depuis son tableau de bord, un athlète depuis « Mes coachs ».
   * - **Pas de compte** : e-mail, qui l'invite à s'inscrire en cochant la case du rôle.
   * - **Compte sans cette capacité** : RIEN. Il ne voit pas l'invitation et ne peut pas l'accepter.
   *   Lui écrire l'enverrait vers une inscription qu'il a déjà faite.
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
        role: invitation.role,
        organizationName,
        expiresInDays: INVITATION_TTL_DAYS,
      });
      return;
    }

    if (invitation.role === InvitationRole.COACH && account.isCoach) {
      await this.notifications.notifyOrganizationInvitationReceived({
        coachId: account.id,
        organizationId,
        invitationId: invitation.id,
      });
    }
    // La même notification que l'invitation d'un Coach : l'athlète la reçoit au même endroit, et
    // le nom de l'entreprise y tient la place de celui du Coach.
    if (invitation.role === InvitationRole.ATHLETE && account.isAthlete) {
      await this.notifications.notifyInvitationReceived({
        athleteId: account.id,
        inviterId: organizationId,
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
