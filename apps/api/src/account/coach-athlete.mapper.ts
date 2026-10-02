import { type CoachAthleteDto, required } from "@cmv/shared";
import type { CoachAthlete } from "@prisma/client";

// Source unique du mapping de la relation coach↔athlète : `RelationService` (lecture) ET
// `InvitationService` (redemption) la renvoient — deux copies divergeraient tôt ou tard.
// Les noms viennent d'une résolution séparée (UserDirectoryService) : un nom manquant signale
// une donnée incohérente, on lève plutôt que d'afficher un blanc (règle dure n°5).
export function toCoachAthleteDto(
  relation: CoachAthlete,
  namesById: Map<string, string>,
): CoachAthleteDto {
  const missing = `[account] utilisateur introuvable pour la relation ${relation.id}`;
  const coachName = required(namesById.get(relation.coachId), missing);
  const athleteName = required(namesById.get(relation.athleteId), missing);

  return {
    id: relation.id,
    coachId: relation.coachId,
    coachName,
    athleteId: relation.athleteId,
    athleteName,
    status: relation.status,
    invitedAt: relation.invitedAt.toISOString(),
    joinedAt: relation.joinedAt?.toISOString() ?? null,
    // Une ligne `CoachAthlete` ne peut PAS être auto-relationnelle (CHECK `coach_athlete_not_self`,
    // #11) : ce qui vient d'ici n'est jamais soi. L'entrée d'auto-coaching est synthétisée à part.
    isSelf: false,
  };
}
