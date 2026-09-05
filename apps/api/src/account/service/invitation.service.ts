import { randomBytes } from "node:crypto";
import {
  type CoachAthleteDto,
  CoachAthleteStatus,
  type CreateInvitationInput,
  type InvitationDto,
  InvitationStatus,
  type PendingInvitationDto,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
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

/**
 * L'adresse sous la forme qui sert à COMPARER — jamais à afficher.
 *
 * Deux chaînes tapées par deux personnes différentes se rencontrent ici : le coach saisit
 * l'adresse de son athlète, l'athlète a saisi la sienne à l'inscription. Rien ne garantit la même
 * casse ni l'absence d'espace collé au copier-coller, et une comparaison brute rendait alors une
 * invitation **définitivement inutilisable** — refusée à l'acceptation, invisible dans la liste,
 * sans qu'aucun message ne dise pourquoi. C'est le contraire de ce que l'invitation nominative
 * promet.
 *
 * Normalisée à l'écriture ET à la comparaison : la première seule ne rattraperait pas les lignes
 * déjà en base, la seconde seule laisserait la colonne porter deux formes du même destinataire.
 */
function forComparison(email: string): string {
  return email.trim().toLowerCase();
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

  // Coach : émet une invitation (code + expiration). coachId injecté par le tenancy layer.
  async create(input: CreateInvitationInput): Promise<InvitationDto> {
    const invitation = await this.db.invitation.create({
      // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
      data: {
        code: randomBytes(9).toString("base64url"),
        // Normalisée dès l'entrée : c'est cette colonne qu'on compare à l'adresse d'une session.
        email: input.email == null ? null : forComparison(input.email),
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
   * Trois issues, et l'important est ce qu'elles ont en commun : **la réponse HTTP est identique**.
   * Le coach reçoit son invitation et son code dans tous les cas — sinon la route dirait qui est
   * inscrit chez nous.
   *
   * - **Invitation générique** (`email === null`) : personne n'est visé, rien à envoyer. Son canal
   *   est le code transmis de la main à la main.
   * - **Adresse rattachée à un compte athlète** : notification (centre + push). Il a une
   *   application où lire, l'e-mail n'ajouterait rien qu'il n'y verra pas.
   * - **Tout le reste** — pas de compte, ou un compte qui ne porte pas la capacité athlète :
   *   e-mail. C'est le cas le PLUS COURANT, celui du nouvel athlète qu'on invite, et c'est
   *   exactement lui qui ne recevait rien jusqu'ici.
   *
   * Aucune des deux branches ne fait échouer la création : les deux appelés absorbent leurs
   * pannes, comme le veut la règle 2 de `NotificationService`.
   */
  private async announce(invitation: {
    id: string;
    coachId: string;
    code: string;
    email: string | null;
  }) {
    if (invitation.email == null) return;

    // Résolu une fois pour les deux canaux : c'est la même question — qui invite ?
    const coachName = (await this.users.namesByIds([invitation.coachId])).get(invitation.coachId);

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
      coachName: coachName ?? null,
      code: invitation.code,
      // Dérivée de la constante, jamais réécrite : l'e-mail part à la création, la durée annoncée
      // est donc exactement celle qui reste (« les plafonds ne s'écrivent jamais en dur », #20).
      expiresInDays: INVITATION_TTL_MS / (24 * 60 * 60 * 1000),
    });
  }

  // Coach : liste ses invitations (scopé coachId).
  async listMine(): Promise<InvitationDto[]> {
    const invitations = await this.db.invitation.findMany({
      orderBy: { createdAt: "desc" },
    });
    return invitations.map(toInvitationDto);
  }

  /**
   * Athlète : les invitations qui l'ATTENDENT (#146). Jusqu'ici, une adresse saisie par le coach
   * ne servait qu'à restreindre l'acceptation — jamais à prévenir l'intéressé, qui devait recevoir
   * le code par un autre canal.
   *
   * Trois filtres, et chacun retire quelque chose de différent :
   * - **l'adresse de la SESSION**, jamais un paramètre. Un `?email=` transformerait cette route en
   *   annuaire : qui a été invité, et par quel coach.
   * - **`PENDING`**, ce qui écarte aussi ce qu'on a déjà refusé — un refus vide la liste, sinon il
   *   ne servirait à rien.
   * - **non expirée**, l'expiration n'étant pas un statut mais une date : une invitation périmée
   *   serait proposée puis refusée à l'acceptation.
   *
   * Une invitation GÉNÉRIQUE (`email === null`) n'apparaît pour personne : elle n'est adressée à
   * personne, et la faire remonter la donnerait au premier arrivé.
   *
   * Client de BASE, comme `accept` : `Invitation` n'a qu'un scope coach dans `TENANT_SCOPES`, et
   * le client tenant lèverait (fail closed) plutôt que de rendre une liste vide.
   */
  async listForMe(athlete: { email: string }): Promise<PendingInvitationDto[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: {
        email: forComparison(athlete.email),
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
   * Athlète : refuse une invitation (#146). Une transition à part entière, d'où sa propre route —
   * la règle « un seul chemin vers une transition » (#105) n'interdit pas deux transitions
   * distinctes.
   *
   * **La correspondance d'e-mail est exigée en toutes circonstances**, là où `accept` ne la
   * vérifie que sur une invitation nominative. Sans ça, le premier détenteur d'un code générique
   * le brûlerait pour tout le monde — refuser est irréversible, le coach devrait réémettre.
   *
   * Un athlète DÉJÀ LIÉ peut refuser, et c'est même le cas utile : cela vide la liste d'attente du
   * coach, qui saurait enfin que son invitation n'aboutira pas.
   */
  async decline(athlete: { id: string; email: string }, code: string): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({ where: { code } });
    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new NotFoundException("Invitation introuvable ou déjà utilisée");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Invitation expirée");
    }
    if (invitation.email == null || invitation.email !== forComparison(athlete.email)) {
      throw new BadRequestException("Invitation destinée à une autre adresse");
    }

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

  // Athlète : rejoint un coach via un code. Client de base (l'athlète n'est pas encore lié).
  async accept(athlete: { id: string; email: string }, code: string): Promise<CoachAthleteDto> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { code },
    });
    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new NotFoundException("Invitation introuvable ou déjà utilisée");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Invitation expirée");
    }
    if (invitation.email != null && invitation.email !== forComparison(athlete.email)) {
      throw new BadRequestException("Invitation destinée à une autre adresse");
    }
    // Invariant : au plus 1 coach par athlète (athleteId UNIQUE en base).
    const existing = await this.prisma.coachAthlete.findUnique({
      where: { athleteId: athlete.id },
    });
    if (existing) {
      throw new ConflictException("Vous êtes déjà lié à un coach");
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
      throw new ConflictException("Vous ne pouvez pas être votre propre coach");
    }

    const seen = new Set<string>([athleteId]);
    let current: string | null = coachId;

    while (current != null) {
      if (seen.has(current)) {
        if (current === athleteId) {
          throw new ConflictException("Ce lien créerait une boucle avec vos propres athlètes");
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
