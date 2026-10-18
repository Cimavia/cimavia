import {
  CoachAthleteStatus,
  type CoachCandidateDto,
  type ConversationCandidatesDto,
  required,
} from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { AccessService } from "../../access/service/access.service";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor, exercisedOrThrow } from "../../tenancy/tenant-context.type";
import { byName, type ConversationMember, memberKeyOf } from "../participant-key";

/**
 * Ceux que l'acteur peut réunir dans une conversation, au titre exercé (#611) — la lecture qui sert
 * le sélecteur (#612) ET la garde de la création : une seule règle, pas une liste affichée d'un
 * côté et une autre vérifiée de l'autre.
 *
 * - Un athlète écrit à ses Coachs, par un lien actif.
 * - Un Coach écrit à ses athlètes, par un lien actif, et aux autres Coachs de ses entreprises.
 *
 * Jamais soi-même : l'auto-coaching n'a pas de lien (#11), et l'acteur est retiré de ses
 * collègues. Jamais un compte Entreprise : il n'a ni lien coach-athlète ni appartenance de Coach.
 */
@Injectable()
export class ConversationCandidateService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    // Client de BASE, pour une seule lecture : lesquels de MES athlètes chaque collègue suit.
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly users: UserDirectoryService,
    private readonly cls: ClsService,
  ) {}

  async list(): Promise<ConversationCandidatesDto> {
    return exercisedOrThrow(currentActor(this.cls)) === "coach" ? this.ofCoach() : this.ofAthlete();
  }

  /**
   * Ces participants sont-ils tous de ceux que l'acteur peut réunir, à ce titre ? La même règle que
   * `list`, sans ce que seul l'affichage demande — noms, suivis des collègues : la garde passe à
   * chaque ouverture de fil.
   */
  async reachesAll(members: readonly ConversationMember[]): Promise<boolean> {
    const actor = currentActor(this.cls);
    const asCoach = exercisedOrThrow(actor) === "coach";
    const links = await this.db.coachAthlete.findMany({
      where: { status: CoachAthleteStatus.ACTIVE },
      select: { coachId: true, athleteId: true },
    });
    const reachable = new Set(
      links.map((link) =>
        asCoach
          ? memberKeyOf({ userId: link.athleteId, capability: "ATHLETE" })
          : memberKeyOf({ userId: link.coachId, capability: "COACH" }),
      ),
    );
    if (asCoach && members.some((member) => member.capability === "COACH")) {
      for (const organization of await this.access.myOrganizations()) {
        for (const { coachId } of organization.coaches) {
          if (coachId !== actor.userId)
            reachable.add(memberKeyOf({ userId: coachId, capability: "COACH" }));
        }
      }
    }
    return members.every((member) => reachable.has(memberKeyOf(member)));
  }

  /**
   * Ses Coachs, chacun avec l'entreprise dont le lien est né (#602) — au plus une : un lien par
   * couple. Le scope athlète ne rend que ses liens.
   */
  private async ofAthlete(): Promise<ConversationCandidatesDto> {
    const links = await this.db.coachAthlete.findMany({
      where: { status: CoachAthleteStatus.ACTIVE },
      select: { coachId: true, organizationId: true },
    });
    const names = await this.users.namesByIds(
      links.flatMap((link) =>
        link.organizationId == null ? [link.coachId] : [link.coachId, link.organizationId],
      ),
    );
    const nameOf = (id: string) => required(names.get(id), `[message] compte ${id} sans nom`);

    const coaches = links.map(
      (link): CoachCandidateDto => ({
        userId: link.coachId,
        name: nameOf(link.coachId),
        organizationNames: link.organizationId == null ? [] : [nameOf(link.organizationId)],
        followedAthleteIds: null,
      }),
    );
    return { athletes: [], coaches: coaches.sort(byName) };
  }

  /**
   * Ses athlètes, et les Coachs de ses entreprises avec ceux de SES athlètes qu'ils suivent : de
   * quoi prévenir que M ne suit pas TE avant de les réunir (tranché en #598, prévenir plutôt
   * qu'interdire).
   *
   * Les collègues et leurs liens sont hors du scope de l'acteur : ils se lisent par le client de
   * base, bornés aux entreprises dont `AccessService` vient de le prouver membre et aux athlètes
   * que sa lecture scopée rend. Seuls des ids en sortent, jamais un lien d'un autre athlète.
   */
  private async ofCoach(): Promise<ConversationCandidatesDto> {
    const { userId } = currentActor(this.cls);
    const [links, organizations] = await Promise.all([
      this.db.coachAthlete.findMany({
        where: { status: CoachAthleteStatus.ACTIVE },
        select: { athleteId: true },
      }),
      this.access.myOrganizations(),
    ]);
    const athleteIds = links.map((link) => link.athleteId);

    const colleagues = new Map<string, { name: string; organizationNames: string[] }>();
    for (const organization of organizations) {
      for (const coach of organization.coaches) {
        if (coach.coachId === userId) continue;
        const colleague = colleagues.get(coach.coachId) ?? {
          name: coach.name,
          organizationNames: [],
        };
        colleague.organizationNames.push(organization.name);
        colleagues.set(coach.coachId, colleague);
      }
    }

    const [names, followed] = await Promise.all([
      this.users.namesByIds(athleteIds),
      this.followedBy([...colleagues.keys()], athleteIds),
    ]);
    const athletes = athleteIds.map((athleteId) => ({
      userId: athleteId,
      name: required(names.get(athleteId), `[message] athlète ${athleteId} sans nom`),
    }));
    const coaches = [...colleagues].map(
      ([coachId, colleague]): CoachCandidateDto => ({
        userId: coachId,
        name: colleague.name,
        organizationNames: colleague.organizationNames,
        followedAthleteIds: followed.get(coachId) ?? [],
      }),
    );
    return { athletes: athletes.sort(byName), coaches: coaches.sort(byName) };
  }

  /** Lesquels de ces athlètes chacun de ces Coachs suit, par un lien actif. */
  private async followedBy(
    coachIds: readonly string[],
    athleteIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    if (coachIds.length === 0 || athleteIds.length === 0) return new Map();
    const links = await this.prisma.coachAthlete.findMany({
      where: {
        coachId: { in: [...coachIds] },
        athleteId: { in: [...athleteIds] },
        status: CoachAthleteStatus.ACTIVE,
      },
      select: { coachId: true, athleteId: true },
    });
    const followed = new Map<string, string[]>();
    for (const link of links) {
      followed.set(link.coachId, [...(followed.get(link.coachId) ?? []), link.athleteId]);
    }
    return followed;
  }
}
