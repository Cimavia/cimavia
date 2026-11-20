import type { PlanWeekInput } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma, TenantTx } from "../tenancy/tenancy.extension";
import { shiftDbDate } from "../util/date.util";

/**
 * Les écritures du CALENDRIER d'un cycle, partagées par l'en-tête (création, changement de début)
 * et par les semaines (ajout, retrait).
 */

/**
 * Insère des semaines consécutives à partir de `firstWeekNumber` (athleteId dénormalisé
 * explicitement : l'extension n'injecte que le propriétaire, coachId, repris du plan — #603).
 */
export async function createWeeks(
  tx: TenantTx | TenantPrisma,
  planId: string,
  athleteId: string | null,
  weeks: readonly PlanWeekInput[],
  firstWeekNumber: number,
): Promise<void> {
  if (weeks.length === 0) return;
  await tx.planWeek.createMany({
    data: weeks.map((week, index) => ({
      planId,
      athleteId,
      weekNumber: firstWeekNumber + index,
      type: week.type,
      note: week.note ?? null,
    })) satisfies Omit<
      Prisma.PlanWeekUncheckedCreateInput,
      "coachId"
    >[] as Prisma.PlanWeekUncheckedCreateInput[],
  });
}

/**
 * Décale les séances visées d'un nombre de jours. Le décalage est TOUJOURS un multiple de 7
 * (les dates de début sont des lundis, une semaine dure 7 jours) : une séance ne peut donc
 * jamais atterrir sur la date d'une autre séance de la même semaine, et l'unicité
 * (planWeekId, scheduledDate, position) tient même pendant la suite de mises à jour.
 */
export async function shiftSessions(
  tx: TenantTx,
  where: Prisma.ScheduledSessionWhereInput,
  days: number,
): Promise<void> {
  const sessions = await tx.scheduledSession.findMany({ where });
  for (const session of sessions) {
    await tx.scheduledSession.update({
      where: { id: session.id },
      data: { scheduledDate: shiftDbDate(session.scheduledDate, days) },
    });
  }
}
