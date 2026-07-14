import type { PlanDto, PlanSummaryDto, PlanWeekDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import { planWeekRange } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { toIsoDate } from "../util/date.util";

// Le plan en liste : pas de contenu, juste de quoi le situer (nb de semaines, nb de séances).
export const PLAN_COUNTS_INCLUDE = {
  _count: { select: { weeks: true, scheduledSessions: true } },
} satisfies Prisma.PlanInclude;

export type PlanWithCounts = Prisma.PlanGetPayload<{
  include: { _count: { select: { weeks: true; scheduledSessions: true } } };
}>;

// Le plan en détail : semaines ordonnées, séances ordonnées par jour puis par position dans la
// journée, nombre d'exercices par séance. Forme rendue par l'API après chaque écriture.
export const PLAN_DETAIL_INCLUDE = {
  weeks: {
    orderBy: { weekNumber: "asc" },
    include: {
      sessions: {
        orderBy: [{ scheduledDate: "asc" }, { position: "asc" }],
        include: { _count: { select: { exercises: true } } },
      },
    },
  },
  _count: { select: { weeks: true, scheduledSessions: true } },
} satisfies Prisma.PlanInclude;

export type PlanWithWeeks = Prisma.PlanGetPayload<{
  include: {
    weeks: { include: { sessions: { include: { _count: { select: { exercises: true } } } } } };
    _count: { select: { weeks: true; scheduledSessions: true } };
  };
}>;

type ScheduledSessionWithCount = PlanWithWeeks["weeks"][number]["sessions"][number];

export function toScheduledSessionSummaryDto(
  session: ScheduledSessionWithCount,
): ScheduledSessionSummaryDto {
  return {
    id: session.id,
    planId: session.planId,
    planWeekId: session.planWeekId,
    sourceSessionId: session.sourceSessionId,
    title: session.title,
    notes: session.notes,
    scheduledDate: toIsoDate(session.scheduledDate),
    position: session.position,
    status: session.status,
    exerciseCount: session._count.exercises,
  };
}

// Les bornes de la semaine ne sont pas stockées : elles se déduisent du `startDate` du plan.
// `planWeekRange` ne rend null que sur une donnée corrompue (weekNumber < 1) → on lève, plutôt
// que de servir une plage inventée (règle dure n°5 : pas de fallback silencieux).
export function toPlanWeekDto(
  week: PlanWithWeeks["weeks"][number],
  planStartDate: Date,
): PlanWeekDto {
  const range = planWeekRange(toIsoDate(planStartDate), week.weekNumber);
  if (range == null) {
    throw new Error(`[plan] semaine ${week.id} : weekNumber ${week.weekNumber} invalide`);
  }
  return {
    id: week.id,
    weekNumber: week.weekNumber,
    type: week.type,
    note: week.note,
    startDate: range.startDate,
    endDate: range.endDate,
    sessions: week.sessions.map(toScheduledSessionSummaryDto),
  };
}

export function toPlanSummaryDto(plan: PlanWithCounts): PlanSummaryDto {
  return {
    id: plan.id,
    coachId: plan.coachId,
    athleteId: plan.athleteId,
    title: plan.title,
    description: plan.description,
    startDate: toIsoDate(plan.startDate),
    status: plan.status,
    publishedAt: plan.publishedAt?.toISOString() ?? null,
    weekCount: plan._count.weeks,
    sessionCount: plan._count.scheduledSessions,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function toPlanDto(plan: PlanWithWeeks): PlanDto {
  return {
    ...toPlanSummaryDto(plan),
    weeks: plan.weeks.map((week) => toPlanWeekDto(week, plan.startDate)),
  };
}
