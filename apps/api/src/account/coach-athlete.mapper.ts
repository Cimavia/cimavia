import type { CoachAthleteDto } from "@cmv/shared";
import type { CoachAthlete } from "@prisma/client";

// Source unique du mapping de la relation coach↔athlète : `RelationService` (lecture) ET
// `InvitationService` (redemption) la renvoient — deux copies divergeraient tôt ou tard.
export function toCoachAthleteDto(relation: CoachAthlete): CoachAthleteDto {
  return {
    id: relation.id,
    coachId: relation.coachId,
    athleteId: relation.athleteId,
    status: relation.status,
    invitedAt: relation.invitedAt.toISOString(),
    joinedAt: relation.joinedAt?.toISOString() ?? null,
  };
}
