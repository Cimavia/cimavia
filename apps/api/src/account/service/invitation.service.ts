import { randomBytes } from "node:crypto";
import {
  type CoachAthleteDto,
  CoachAthleteStatus,
  type CreateInvitationInput,
  type InvitationDto,
  InvitationStatus,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toCoachAthleteDto } from "../coach-athlete.mapper";
import { toInvitationDto } from "../invitation.mapper";
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
  ) {}

  // Coach : émet une invitation (code + expiration). coachId injecté par le tenancy layer.
  async create(input: CreateInvitationInput): Promise<InvitationDto> {
    const invitation = await this.db.invitation.create({
      // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
      data: {
        code: randomBytes(9).toString("base64url"),
        email: input.email ?? null,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      } satisfies Omit<
        Prisma.InvitationUncheckedCreateInput,
        "coachId"
      > as Prisma.InvitationUncheckedCreateInput,
    });
    return toInvitationDto(invitation);
  }

  // Coach : liste ses invitations (scopé coachId).
  async listMine(): Promise<InvitationDto[]> {
    const invitations = await this.db.invitation.findMany({
      orderBy: { createdAt: "desc" },
    });
    return invitations.map(toInvitationDto);
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
    if (invitation.email != null && invitation.email !== athlete.email) {
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
