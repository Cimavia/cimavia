import {
  type CoachAthleteDto,
  CoachAthleteStatus,
  type CreateInvitationInput,
  type InvitationDto,
  InvitationRole,
  InvitationStatus,
  normalizeEmail,
  type PendingInvitationDto,
  required,
} from "@cmv/shared";
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import type { Invitation, Prisma } from "@prisma/client";
import { InvitationMailer } from "../../infra/mail/invitation.mailer";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toCoachAthleteDto } from "../coach-athlete.mapper";
import { hasCoachCycle } from "../coach-graph";
import {
  assertActionable,
  INVITATION_TTL_DAYS,
  invitationExpiry,
  pendingFor,
  removeDeclined,
  revokePending,
} from "../invitation.lifecycle";
import { toInvitationDto, toPendingInvitationDto } from "../invitation.mapper";
import { UserDirectoryService } from "./user-directory.service";

/**
 * Le Coach d'une invitation d'athlète. Toutes viennent d'un Coach jusqu'à #602, qui ouvrira
 * l'invitation d'athlètes par une entreprise : un `coachId` absent ici est une donnée incohérente,
 * pas un cas à replier.
 */
function issuingCoach(invitation: Pick<Invitation, "id" | "coachId">): string {
  return required(
    invitation.coachId,
    `[account] invitation d'athlète sans Coach : ${invitation.id}`,
  );
}

@Injectable()
export class InvitationService {
  constructor(
    // Client scopé (coach) : coachId injecté automatiquement.
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    // Client de base (non scopé) : redemption = flux d'onboarding cross-tenant.
    private readonly prisma: PrismaService,
    private readonly users: UserDirectoryService,
    private readonly notifications: NotificationService,
    private readonly mailer: InvitationMailer,
  ) {}

  // Coach : invite une adresse, pour sept jours. coachId injecté par le tenancy layer.
  async create(input: CreateInvitationInput): Promise<InvitationDto> {
    const invitation = await this.db.invitation.create({
      // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
      data: {
        // Normalisée dès l'entrée : c'est cette colonne qu'on compare à l'adresse d'une session.
        email: normalizeEmail(input.email),
        expiresAt: invitationExpiry(),
      } satisfies Omit<
        Prisma.InvitationUncheckedCreateInput,
        "coachId"
      > as Prisma.InvitationUncheckedCreateInput,
    });
    await this.announce(invitation);
    return toInvitationDto(invitation);
  }

  /**
   * Prévenir l'invité — par le canal qu'il a (#146).
   *
   * Deux issues, et l'important est ce qu'elles ont en commun : **la réponse HTTP est identique**.
   * Le coach reçoit son invitation dans les deux cas — sinon la route dirait qui est inscrit chez
   * nous. (Une troisième, l'invitation générique qui ne prévenait personne, a disparu en #390.)
   *
   * - **Adresse rattachée à un compte athlète** : notification (centre + push). Il a une
   *   application où lire, l'e-mail n'ajouterait rien qu'il n'y verra pas.
   * - **Tout le reste** — pas de compte, ou un compte qui ne porte pas la capacité athlète :
   *   e-mail. C'est le cas le PLUS COURANT, celui du nouvel athlète qu'on invite, et c'est
   *   exactement lui qui ne recevait rien jusqu'ici.
   *
   * Aucune des deux branches ne fait échouer la création : les deux appelés absorbent leurs
   * pannes, comme le veut la règle 2 de `NotificationService`.
   */
  private async announce(invitation: Invitation) {
    const coachId = issuingCoach(invitation);
    // Résolu une fois pour les deux canaux : c'est la même question — qui invite ? Le coach est
    // l'acteur courant : son nom introuvable serait une donnée incohérente, pas un e-mail anonyme.
    const coachName = required(
      (await this.users.namesByIds([coachId])).get(coachId),
      `[account] coach introuvable pour l'invitation ${invitation.id}`,
    );

    const athleteId = await this.users.athleteIdByEmail(invitation.email);
    if (athleteId != null) {
      await this.notifications.notifyInvitationReceived({
        athleteId,
        coachId,
        invitationId: invitation.id,
      });
      return;
    }

    await this.mailer.send({
      to: invitation.email,
      coachName,
      // L'e-mail part à la création : la durée annoncée est exactement celle qui reste.
      expiresInDays: INVITATION_TTL_DAYS,
    });
  }

  /**
   * Coach : liste ses invitations (scopé coachId), sauf celles qu'il a retirées (#524). Retirer est
   * SON geste : il n'a rien à y apprendre, et la ligne n'a plus d'action à lui offrir.
   */
  async listMine(): Promise<InvitationDto[]> {
    const invitations = await this.db.invitation.findMany({
      where: { status: { not: InvitationStatus.REVOKED } },
      orderBy: { createdAt: "desc" },
    });
    return invitations.map(toInvitationDto);
  }

  /**
   * Coach : efface une invitation REFUSÉE (#146), le seul état qui s'efface — voir
   * `removeDeclined`. Client TENANT : `Invitation` est scopée `coachId` pour la capacité coach, et
   * l'invitation d'un autre émetteur rend donc **404** et non 403.
   */
  async remove(id: string): Promise<void> {
    await removeDeclined(this.db.invitation, id);
  }

  /**
   * Coach : retire une invitation EN ATTENTE (#524) — partie à la mauvaise adresse, ou devenue sans
   * objet. Client TENANT comme `remove` ; la transition elle-même est décrite par `revokePending`.
   */
  async revoke(id: string): Promise<void> {
    await revokePending(this.db.invitation, id);
  }

  /**
   * Athlète : les invitations qui l'ATTENDENT (#146) — depuis #390, le seul chemin par lequel une
   * invitation lui parvient : il n'y a plus de code à saisir.
   *
   * Quatre filtres, et chacun retire quelque chose de différent :
   * - **l'adresse de la SESSION**, jamais un paramètre. Un `?email=` transformerait cette route en
   *   annuaire : qui a été invité, et par quel coach.
   * - **`PENDING`**, ce qui écarte aussi ce qu'on a déjà refusé — un refus vide la liste, sinon il
   *   ne servirait à rien.
   * - **non expirée**, l'expiration n'étant pas un statut mais une date : une invitation périmée
   *   serait proposée puis refusée à l'acceptation ;
   * - **le rôle athlète** (#601) : l'invitation d'une entreprise à devenir Coach ne s'accepte pas
   *   d'ici, et ne doit pas y apparaître.
   *
   * Client de BASE, comme `accept` : `Invitation` n'a qu'un scope coach dans `TENANT_SCOPES`, et
   * le client tenant lèverait (fail closed) plutôt que de rendre une liste vide.
   */
  async listForMe(athlete: { email: string }): Promise<PendingInvitationDto[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: pendingFor(athlete.email, InvitationRole.ATHLETE),
      orderBy: { createdAt: "desc" },
    });
    if (invitations.length === 0) return [];

    const names = await this.users.namesByIds(invitations.map(issuingCoach));
    return invitations.map((invitation) => toPendingInvitationDto(invitation, names));
  }

  /**
   * L'invitation que désigne `id`, si CET athlète peut encore l'accepter ou la refuser — voir
   * `assertActionable`. Client de BASE : l'athlète n'est pas l'acteur du scope de `Invitation`.
   */
  private async findActionable(athlete: { email: string }, id: string) {
    const invitation = assertActionable(
      await this.prisma.invitation.findUnique({ where: { id } }),
      {
        email: athlete.email,
        role: InvitationRole.ATHLETE,
        revokedMessage: "Invitation retirée par le coach",
      },
    );
    return { ...invitation, coachId: issuingCoach(invitation) };
  }

  /**
   * Athlète : refuse une invitation (#146). Une transition à part entière, d'où sa propre route —
   * la règle « un seul chemin vers une transition » (#105) n'interdit pas deux transitions
   * distinctes.
   *
   * Un athlète DÉJÀ LIÉ peut refuser, et c'est même le cas utile : cela vide la liste d'attente du
   * coach, qui saurait enfin que son invitation n'aboutira pas.
   */
  async decline(athlete: { id: string; email: string }, id: string): Promise<void> {
    const invitation = await this.findActionable(athlete, id);

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.DECLINED },
    });
    // APRÈS l'écriture, comme partout : une notification est un effet de bord, et l'action métier
    // a déjà réussi quand elle part.
    await this.notifications.notifyInvitationDeclined({
      coachId: invitation.coachId,
      athleteId: athlete.id,
      invitationId: invitation.id,
    });
  }

  // Athlète : rejoint le coach qui l'a invité. Client de base (l'athlète n'est pas encore lié).
  async accept(athlete: { id: string; email: string }, id: string): Promise<CoachAthleteDto> {
    const invitation = await this.findActionable(athlete, id);
    // Un lien par COUPLE (#599) : un athlète a 0..N coachs, mais un seul lien avec chacun.
    const existing = await this.prisma.coachAthlete.findUnique({
      where: { coachId_athleteId: { coachId: invitation.coachId, athleteId: athlete.id } },
    });
    if (existing) {
      throw new ConflictException("Tu es déjà suivi par ce coach");
    }
    await this.assertNoCycle(invitation.coachId, athlete.id);

    const [relation] = await this.prisma.$transaction([
      this.prisma.coachAthlete.create({
        data: {
          coachId: invitation.coachId,
          athleteId: athlete.id,
          status: CoachAthleteStatus.ACTIVE,
          joinedAt: new Date(),
        },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedById: athlete.id,
        },
      }),
    ]);
    await this.notifications.notifyInvitationAccepted({
      coachId: invitation.coachId,
      athleteId: athlete.id,
      invitationId: invitation.id,
    });

    const names = await this.users.namesByIds([relation.coachId, relation.athleteId]);
    return toCoachAthleteDto(relation, names);
  }

  /**
   * Refuse une relation qui bouclerait (#11). Deux cas, et le premier n'est un cas que depuis
   * #9/#10 : accepter une invitation exige la capacité athlète, donc seul un compte qui CUMULE
   * peut accepter la sienne.
   *
   * Le second cherche l'invité parmi les coachs de l'inviteur, de proche en proche. Depuis #599 ce
   * n'est plus une chaîne mais un graphe — un compte a 0..N coachs. A coache B, B coache C, C
   * invite A : A est au-dessus de C, et le lien refermerait la boucle.
   *
   * Une boucle DÉJÀ présente en base — un chemin de création futur qui oublierait cette garde, une
   * écriture manuelle — n'est pas un refus métier mais une incohérence de données : on lève,
   * bruyamment et distinctement, plutôt que de la déguiser en 409. Elle se cherche APRÈS le
   * chargement, par `hasCoachCycle` : pendant le parcours, retomber sur un compte déjà vu ne la
   * prouve plus (voir le losange qu'elle décrit).
   */
  private async assertNoCycle(coachId: string, athleteId: string): Promise<void> {
    if (coachId === athleteId) {
      throw new ConflictException("Tu ne peux pas être ton propre coach");
    }

    const coaches = await this.coachesAbove(coachId);
    if (coaches.has(athleteId)) {
      throw new ConflictException("Ce lien créerait une boucle avec tes propres athlètes");
    }
    if (hasCoachCycle(coaches)) {
      throw new Error(`[relation] cycle DÉJÀ présent dans CoachAthlete au-dessus de ${coachId}`);
    }
  }

  /**
   * Tous les comptes au-dessus de `coachId` (lui compris), avec leurs coachs. Une requête par
   * NIVEAU, pas par compte : la profondeur se compte en unités, la largeur peut croître avec les
   * entreprises.
   *
   * Termine même sur une base qui boucle : un compte n'entre qu'une fois dans la frontière.
   */
  private async coachesAbove(coachId: string): Promise<Map<string, string[]>> {
    const coaches = new Map<string, string[]>();
    let frontier = [coachId];

    while (frontier.length > 0) {
      const links = await this.prisma.coachAthlete.findMany({
        where: { athleteId: { in: frontier } },
        select: { coachId: true, athleteId: true },
      });
      for (const account of frontier) coaches.set(account, []);
      for (const link of links) coaches.get(link.athleteId)?.push(link.coachId);
      frontier = [...new Set(links.map((link) => link.coachId))].filter(
        (account) => !coaches.has(account),
      );
    }
    return coaches;
  }
}
