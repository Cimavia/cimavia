import type { CoachAthleteDto } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { CoachAthlete } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toCoachAthleteDto } from "../coach-athlete.mapper";
import { UserDirectoryService } from "./user-directory.service";

@Injectable()
export class RelationService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly users: UserDirectoryService,
  ) {}

  // Coach : ses relations (scopé coachId → seulement SES athlètes).
  async listAthletes(): Promise<CoachAthleteDto[]> {
    const relations = await this.db.coachAthlete.findMany({
      orderBy: { joinedAt: "desc" },
    });
    return this.withNames(relations);
  }

  // Athlète : sa relation coach, ou null s'il est autonome (pas de fallback silencieux).
  async myCoach(): Promise<CoachAthleteDto | null> {
    const relation = await this.db.coachAthlete.findFirst();
    if (relation == null) return null;
    const [dto] = await this.withNames([relation]);
    return dto ?? null;
  }

  // Un seul aller-retour pour tous les noms, quel que soit le nombre de relations.
  private async withNames(relations: CoachAthlete[]): Promise<CoachAthleteDto[]> {
    const names = await this.users.namesByIds(
      relations.flatMap((relation) => [relation.coachId, relation.athleteId]),
    );
    return relations.map((relation) => toCoachAthleteDto(relation, names));
  }
}
