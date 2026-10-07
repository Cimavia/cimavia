import { type CoachAthleteDto, required } from "@cmv/shared";
import type { CoachAthlete } from "@prisma/client";
import type { UserDirectoryService } from "./service/user-directory.service";

// Source unique du mapping de la relation coach↔athlète : `RelationService` (lecture) ET
// `InvitationService` (redemption) la renvoient — deux copies divergeraient tôt ou tard.
// Les noms viennent d'une résolution séparée (UserDirectoryService) : un nom manquant signale
// une donnée incohérente, on lève plutôt que d'afficher un blanc (règle dure n°5). Celui de
// l'entreprise aussi (#602) — c'est le `name` de son compte, résolu dans la même map. Un lien
// direct n'en a pas : `null` y veut dire « aucune entreprise ».
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
    organizationName:
      relation.organizationId == null
        ? null
        : required(namesById.get(relation.organizationId), missing),
    // Une ligne `CoachAthlete` ne peut PAS être auto-relationnelle (CHECK `coach_athlete_not_self`,
    // #11) : ce qui vient d'ici n'est jamais soi. L'entrée d'auto-coaching est synthétisée à part.
    isSelf: false,
  };
}

/**
 * Les relations, nommées en UN aller-retour quel que soit leur nombre : les deux parties et
 * l'entreprise dont le lien est né (#602). Partagé par la lecture (`RelationService`) et
 * l'acceptation, qui rend désormais plusieurs liens d'un coup.
 */
export async function withNames(
  users: Pick<UserDirectoryService, "namesByIds">,
  relations: CoachAthlete[],
): Promise<CoachAthleteDto[]> {
  const names = await users.namesByIds(
    relations.flatMap((relation) => [
      relation.coachId,
      relation.athleteId,
      ...(relation.organizationId == null ? [] : [relation.organizationId]),
    ]),
  );
  return relations.map((relation) => toCoachAthleteDto(relation, names));
}
