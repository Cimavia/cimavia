import { CoachAthleteStatus } from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { FollowEndedException } from "../util/follow-ended.util";

/** Ce qu'il faut d'une transaction pour verrouiller une ligne — client de base ou tenant. */
type RawQuerier = Pick<Prisma.TransactionClient, "$queryRaw">;

/**
 * Tient le lien du couple sous un verrou PARTAGÉ jusqu'à la fin de la transaction, et le veut
 * actif — sinon 409 `FOLLOW_ENDED` (#909).
 *
 * Pris par la création et la réaffectation d'un cycle, avant d'écrire : la rupture pose la fin du
 * suivi sur les cycles du couple (`Plan.followEndedAt`) dans la transaction qui passe le lien à
 * ENDED, sous le verrou de sa propre écriture. Sans celui-ci, un cycle écrit pendant la rupture,
 * sur la foi d'un lien encore actif, naîtrait ouvert dans un couple rompu. Avec lui, l'un attend
 * l'autre : la rupture voit le cycle et le ferme, ou le cycle voit la rupture et refuse.
 *
 * Partagé et non exclusif : deux cycles du même couple s'écrivent sans s'attendre.
 *
 * L'auto-coaching n'a pas de lien (CHECK `coach_athlete_not_self`, #11) : rien à tenir.
 */
export async function holdActiveLink(
  tx: RawQuerier,
  coachId: string,
  athleteId: string,
): Promise<void> {
  if (coachId === athleteId) return;
  // biome-ignore lint/plugin/noRawSql: Prisma n'exprime pas FOR SHARE ; relit le seul statut du lien d'un couple, par sa clé
  const [link] = await tx.$queryRaw<{ status: CoachAthleteStatus }[]>`
    SELECT "status" FROM "coach_athlete"
    WHERE "coachId" = ${coachId} AND "athleteId" = ${athleteId}
    FOR SHARE`;
  // Vérifié actif juste avant la transaction : un lien qui disparaît entre-temps est parti avec
  // un compte supprimé — le même refus que s'il n'avait jamais existé.
  if (link == null) throw new BadRequestException("Athlète inconnu");
  if (link.status !== CoachAthleteStatus.ACTIVE) throw new FollowEndedException();
}
