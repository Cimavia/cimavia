import type { CoachAthleteDto } from "@cmv/shared";
import type { CoachAthlete } from "@prisma/client";

// Source unique du mapping de la relation coach↔athlète : `RelationService` (lecture) ET
// `InvitationService` (redemption) la renvoient — deux copies divergeraient tôt ou tard.
// Les noms viennent d'une résolution séparée (UserDirectoryService) : un nom manquant signale
// une donnée incohérente, on lève plutôt que d'afficher un blanc (règle dure n°5).
export function toCoachAthleteDto(
  relation: CoachAthlete,
  namesById: Map<string, string>,
): CoachAthleteDto {
  const coachName = namesById.get(relation.coachId);
  const athleteName = namesById.get(relation.athleteId);
  if (coachName == null || athleteName == null) {
    throw new Error(`[account] utilisateur introuvable pour la relation ${relation.id}`);
  }

  return {
    id: relation.id,
    coachId: relation.coachId,
    coachName,
    athleteId: relation.athleteId,
    athleteName,
    status: relation.status,
    invitedAt: relation.invitedAt.toISOString(),
    joinedAt: relation.joinedAt?.toISOString() ?? null,
  };
}
