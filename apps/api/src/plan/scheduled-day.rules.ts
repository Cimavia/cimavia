import { isDateInPlanWeek } from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { toIsoDate } from "../util/date.util";
import type { PositionedSession } from "./scheduled-session.position";

/**
 * Une séance ne peut pas être posée hors de la plage de sa semaine (sinon la vue calendrier
 * afficherait une séance de la semaine 2 dans la semaine 1).
 */
export function assertDateInWeek(
  plan: { startDate: Date },
  week: { weekNumber: number },
  date: string,
): void {
  if (!isDateInPlanWeek(toIsoDate(plan.startDate), week.weekNumber, date)) {
    throw new BadRequestException(
      `La date ${date} ne tombe pas dans la semaine ${week.weekNumber} du cycle`,
    );
  }
}

/**
 * Vérifie que `sessionIds` décrit une journée VALIDE, et rend ses séances dans l'ordre demandé.
 *
 * Deux règles, et une seule liberté :
 *  - tout identifiant cité appartient au CYCLE (#689). Un identifiant étranger désigne soit un
 *    autre cycle, soit un autre coach — que le scope tenant a déjà rendu invisible. 400 dans les
 *    deux cas : la demande est mal formée ;
 *  - aucune séance déjà posée ce jour-là n'est OMISE. L'omettre ne dirait pas où elle va : elle
 *    garderait son rang d'avant, donc des doublons et des trous sur
 *    `@@unique([planWeekId, scheduledDate, position])`. Vider une journée se fait en déplaçant ou
 *    en supprimant ses séances, pas en les taisant ;
 *  - en revanche une séance d'un AUTRE jour du cycle peut être citée : elle est déplacée ici, au
 *    rang où le tableau la place. C'est tout l'objet de l'élargissement (#93, puis #689).
 */
export function assertDayContent<T extends PositionedSession>(
  cycleSessions: readonly T[],
  sessionIds: readonly string[],
  date: Date,
): T[] {
  const byId = new Map(cycleSessions.map((session) => [session.id, session]));
  const wanted = new Set(sessionIds);

  if (wanted.size !== sessionIds.length) {
    throw new BadRequestException("Une séance est citée deux fois dans l'ordre demandé");
  }

  const missing = cycleSessions.filter(
    (session) => session.scheduledDate.getTime() === date.getTime() && !wanted.has(session.id),
  );
  if (missing.length > 0) {
    throw new BadRequestException(
      "L'ordre doit citer TOUTES les séances déjà posées ce jour-là, sans en omettre",
    );
  }

  return sessionIds.map((id) => {
    const session = byId.get(id);
    if (session == null) {
      throw new BadRequestException(`La séance ${id} n'appartient pas à ce cycle`);
    }
    return session;
  });
}
