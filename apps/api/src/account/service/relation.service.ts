import type { CoachAthleteDto } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { CoachAthlete } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";

function toDto(relation: CoachAthlete): CoachAthleteDto {
  return {
    id: relation.id,
    coachId: relation.coachId,
    athleteId: relation.athleteId,
    status: relation.status,
    invitedAt: relation.invitedAt.toISOString(),
    joinedAt: relation.joinedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class RelationService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  // Coach : ses relations (scopé coachId → seulement SES athlètes).
  async listAthletes(): Promise<CoachAthleteDto[]> {
    const relations = await this.db.coachAthlete.findMany({
      orderBy: { joinedAt: "desc" },
    });
    return relations.map(toDto);
  }

  // Athlète : sa relation coach, ou null s'il est autonome (pas de fallback silencieux).
  async myCoach(): Promise<CoachAthleteDto | null> {
    const relation = await this.db.coachAthlete.findFirst();
    return relation == null ? null : toDto(relation);
  }
}
