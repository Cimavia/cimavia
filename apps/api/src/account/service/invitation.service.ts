import {
  type CoachAthleteDto,
  CoachAthleteStatus,
  type CreateInvitationInput,
  type InvitationDto,
  InvitationStatus,
  normalizeEmail,
  type PendingInvitationDto,
  required,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { InvitationMailer } from "../../infra/mail/invitation.mailer";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toCoachAthleteDto } from "../coach-athlete.mapper";
import { toInvitationDto, toPendingInvitationDto } from "../invitation.mapper";
import { UserDirectoryService } from "./user-directory.service";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

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
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
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
  private async announce(invitation: { id: string; coachId: string; email: string }) {
    // Résolu une fois pour les deux canaux : c'est la même question — qui invite ? Le coach est
    // l'acteur courant : son nom introuvable serait une donnée incohérente, pas un e-mail anonyme.
    const coachName = required(
      (await this.users.namesByIds([invitation.coachId])).get(invitation.coachId),
      `[account] coach introuvable pour l'invitation ${invitation.id}`,
    );

    const athleteId = await this.users.athleteIdByEmail(invitation.email);
    if (athleteId != null) {
      await this.notifications.notifyInvitationReceived({
        athleteId,
        coachId: invitation.coachId,
        invitationId: invitation.id,
      });
      return;
    }

    await this.mailer.send({
      to: invitation.email,
      coachName,
      // Dérivée de la constante, jamais réécrite : l'e-mail part à la création, la durée annoncée
      // est donc exactement celle qui reste (« les plafonds ne s'écrivent jamais en dur », #20).
      expiresInDays: INVITATION_TTL_MS / (24 * 60 * 60 * 1000),
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
   * Coach : efface une invitation REFUSÉE (#146). Le seul état qui s'efface, et le refus des trois
   * autres n'est pas une précaution — chacun perdrait quelque chose de différent :
   *
   * - **`PENDING`** : la retirer est une RÉVOCATION, c'est-à-dire une autre transition, qui a sa
   *   route (`revoke`, #524). La déguiser en suppression ferait disparaître une invitation encore
   *   acceptable sans jamais le dire à qui l'a reçue.
   * - **`ACCEPTED`** : la ligne est la trace de la façon dont la relation s'est nouée
   *   (`acceptedByAthleteId`). L'effacer effacerait cette trace.
   * - **`REVOKED`** : la ligne a déjà quitté la liste du coach (`listMine`) ; elle reste en base
   *   pour que l'athlète qui l'a reçue apprenne qu'elle a été retirée, plutôt qu'introuvable.
   *
   * Client TENANT, contrairement aux trois méthodes de l'athlète : `Invitation` est scopée
   * `coachId`, et c'est exactement le filtre qu'on veut. Une invitation d'un autre coach rend donc
   * **404** et non 403 — on ne confirme pas l'existence de ce qu'on n'a pas le droit de voir.
   */
  async remove(id: string): Promise<void> {
    const invitation = await this.db.invitation.findFirst({ where: { id } });
    if (invitation == null) {
      throw new NotFoundException("Invitation introuvable");
    }
    if (invitation.status !== InvitationStatus.DECLINED) {
      throw new ConflictException("Seule une invitation refusée peut être effacée");
    }

    await this.db.invitation.delete({ where: { id } });
  }

  /**
   * Coach : retire une invitation EN ATTENTE (#524) — partie à la mauvaise adresse, ou devenue sans
   * objet. Une transition (`PENDING` → `REVOKED`) et non une suppression : la ligne reste pour que
   * l'athlète qui tenterait encore de l'accepter lise « retirée », pas « introuvable ».
   *
   * Client TENANT comme `remove` : l'invitation d'un autre coach rend 404. Tout statut autre que
   * `PENDING` rend 409 — une invitation acceptée, refusée ou déjà retirée n'a plus rien à retirer.
   * Une invitation EXPIRÉE, elle, reste révocable : l'expiration est une date, pas un statut.
   *
   * La condition `status: PENDING` est dans l'écriture elle-même, pas seulement dans la lecture qui
   * la précède : une acceptation qui passerait entre les deux ne serait pas réécrite en révocation.
   */
  async revoke(id: string): Promise<void> {
    const invitation = await this.db.invitation.findFirst({ where: { id } });
    if (invitation == null) {
      throw new NotFoundException("Invitation introuvable");
    }
    const { count } = await this.db.invitation.updateMany({
      where: { id, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.REVOKED },
    });
    if (count === 0) {
      throw new ConflictException("Seule une invitation en attente peut être retirée");
    }
  }

  /**
   * Athlète : les invitations qui l'ATTENDENT (#146) — depuis #390, le seul chemin par lequel une
   * invitation lui parvient : il n'y a plus de code à saisir.
   *
   * Trois filtres, et chacun retire quelque chose de différent :
   * - **l'adresse de la SESSION**, jamais un paramètre. Un `?email=` transformerait cette route en
   *   annuaire : qui a été invité, et par quel coach.
   * - **`PENDING`**, ce qui écarte aussi ce qu'on a déjà refusé — un refus vide la liste, sinon il
   *   ne servirait à rien.
   * - **non expirée**, l'expiration n'étant pas un statut mais une date : une invitation périmée
   *   serait proposée puis refusée à l'acceptation.
   *
   * Client de BASE, comme `accept` : `Invitation` n'a qu'un scope coach dans `TENANT_SCOPES`, et
   * le client tenant lèverait (fail closed) plutôt que de rendre une liste vide.
   */
  async listForMe(athlete: { email: string }): Promise<PendingInvitationDto[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: {
        email: normalizeEmail(athlete.email),
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (invitations.length === 0) return [];

    const names = await this.users.namesByIds(invitations.map((invitation) => invitation.coachId));
    return invitations.map((invitation) => toPendingInvitationDto(invitation, names));
  }

  /**
   * L'invitation que désigne `id`, si elle peut encore être acceptée ou refusée par CETTE session.
   *
   * **L'adresse se vérifie en premier, et son échec ne se distingue pas d'un `id` inconnu** (#390).
   * L'`id` n'est pas un secret — il circule dans la carte, dans les notifications —, c'est l'adresse
   * de la session qui fait le verrou. Répondre « expirée » ou « déjà utilisée » à quelqu'un d'autre
   * que le destinataire lui apprendrait le sort d'une invitation qui ne le regarde pas ; répondre
   * « destinée à une autre adresse » lui confirmerait qu'elle existe.
   *
   * Une invitation RETIRÉE par le coach (#524) le dit, et seulement à son destinataire : c'est
   * tout l'intérêt d'un statut plutôt que d'une ligne effacée. 410 et non 404 — elle a existé, et
   * elle ne reviendra pas.
   *
   * Client de BASE : `Invitation` n'a qu'un scope coach dans `TENANT_SCOPES`, et l'athlète n'est pas
   * l'acteur de ce scope.
   */
  private async findActionable(athlete: { email: string }, id: string) {
    const invitation = await this.prisma.invitation.findUnique({ where: { id } });
    if (invitation == null || invitation.email !== normalizeEmail(athlete.email)) {
      throw new NotFoundException("Invitation introuvable");
    }
    if (invitation.status === InvitationStatus.REVOKED) {
      throw new GoneException("Invitation retirée par le coach");
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new NotFoundException("Invitation introuvable ou déjà utilisée");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Invitation expirée");
    }
    return invitation;
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
    // Invariant : au plus 1 coach par athlète (athleteId UNIQUE en base).
    const existing = await this.prisma.coachAthlete.findUnique({
      where: { athleteId: athlete.id },
    });
    if (existing) {
      throw new ConflictException("Tu es déjà lié à un coach");
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
          acceptedByAthleteId: athlete.id,
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
   * Le second remonte la chaîne de coachs de l'inviteur. Elle est LINÉAIRE, pas arborescente :
   * `athleteId` est unique, donc chaque compte a au plus un coach, et la structure est une forêt.
   * A coache B, B coache C, C invite A — la remontée depuis C rencontre A, et refuse.
   *
   * `seen` n'est pas une précaution de style. Si la base contient DÉJÀ un cycle — un chemin de
   * création futur qui oublierait cette garde, une écriture manuelle — la remontée ne terminerait
   * jamais et la requête pendrait jusqu'au timeout. Repasser sur un nœud déjà vu n'est pas un refus
   * métier mais une incohérence de données : on lève, bruyamment et distinctement, plutôt que de la
   * déguiser en 409.
   */
  private async assertNoCycle(coachId: string, athleteId: string): Promise<void> {
    if (coachId === athleteId) {
      throw new ConflictException("Tu ne peux pas être ton propre coach");
    }

    const seen = new Set<string>([athleteId]);
    let current: string | null = coachId;

    while (current != null) {
      if (seen.has(current)) {
        if (current === athleteId) {
          throw new ConflictException("Ce lien créerait une boucle avec tes propres athlètes");
        }
        throw new Error(
          `[relation] cycle DÉJÀ présent dans CoachAthlete en remontant depuis ${coachId}`,
        );
      }
      seen.add(current);
      const parent: { coachId: string } | null = await this.prisma.coachAthlete.findUnique({
        where: { athleteId: current },
        select: { coachId: true },
      });
      current = parent?.coachId ?? null;
    }
  }
}
