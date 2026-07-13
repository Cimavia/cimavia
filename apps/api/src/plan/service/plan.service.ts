import type {
  CreatePlanInput,
  PlanDto,
  PlanSummaryDto,
  PlanWeekInput,
  UpdatePlanInput,
  UpdatePlanWeekInput,
} from "@cmv/shared";
import {
  CoachAthleteStatus,
  DAYS_PER_WEEK,
  daysBetweenIsoDates,
  PLAN_MAX_WEEKS,
} from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PlanWeek, Prisma } from "@prisma/client";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { shiftDbDate, toDbDate, toIsoDate } from "../../util/date.util";
import { type PlanWithWeeks, toPlanDto, toPlanSummaryDto } from "../plan.mapper";

// Semaines ordonnées, séances ordonnées par jour puis par position dans la journée.
const PLAN_DETAIL_INCLUDE = {
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

const PLAN_COUNTS_INCLUDE = {
  _count: { select: { weeks: true, scheduledSessions: true } },
} satisfies Prisma.PlanInclude;

export type ListPlansFilters = { athleteId?: string };

@Injectable()
export class PlanService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  async create(input: CreatePlanInput): Promise<PlanDto> {
    await this.assertAthleteOwned(input.athleteId);

    const plan = await this.db.$transaction(async (tx) => {
      // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
      const created = await tx.plan.create({
        data: {
          athleteId: input.athleteId,
          title: input.title,
          description: input.description ?? null,
          startDate: toDbDate(input.startDate),
        } satisfies Omit<
          Prisma.PlanUncheckedCreateInput,
          "coachId"
        > as Prisma.PlanUncheckedCreateInput,
      });
      await this.createWeeks(tx, created.id, input.athleteId, input.weeks, 1);
      return created;
    });

    return this.getDto(plan.id);
  }

  async list(filters: ListPlansFilters): Promise<PlanSummaryDto[]> {
    const where: Prisma.PlanWhereInput = {};
    if (filters.athleteId) where.athleteId = filters.athleteId;

    const plans = await this.db.plan.findMany({
      where,
      include: PLAN_COUNTS_INCLUDE,
      orderBy: { startDate: "desc" },
    });
    return plans.map(toPlanSummaryDto);
  }

  async get(id: string): Promise<PlanDto> {
    return this.getDto(id);
  }

  /**
   * Déplacer la date de début décale le cycle ENTIER : les séances suivent leur semaine, sinon
   * elles sortiraient de la plage de celle-ci (invariant « une séance tombe dans sa semaine »).
   */
  async update(id: string, input: UpdatePlanInput): Promise<PlanDto> {
    const plan = await this.getOwnedOrThrow(id);

    const data: Prisma.PlanUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;

    let shiftDays = 0;
    if (input.startDate !== undefined) {
      const days = daysBetweenIsoDates(toIsoDate(plan.startDate), input.startDate);
      if (days == null) {
        throw new Error(`[plan] date de début illisible pour le plan ${id}`);
      }
      shiftDays = days;
      data.startDate = toDbDate(input.startDate);
    }

    await this.db.$transaction(async (tx) => {
      await tx.plan.update({ where: { id }, data });
      if (shiftDays !== 0) {
        await this.shiftSessions(tx, { planId: id }, shiftDays);
      }
    });

    return this.getDto(id);
  }

  async delete(id: string): Promise<void> {
    await this.getOwnedOrThrow(id);
    // Semaines, séances, exercices et copies de documents partent en cascade (schéma). Les objets
    // S3 ne sont PAS touchés : ils appartiennent à la bibliothèque, les copies les partagent.
    await this.db.plan.delete({ where: { id } });
  }

  // ── Semaines ───────────────────────────────────────────────────────────────

  async addWeek(planId: string, input: PlanWeekInput): Promise<PlanDto> {
    const plan = await this.getOwnedOrThrow(planId);

    const weekCount = plan.weeks.length;
    if (weekCount >= PLAN_MAX_WEEKS) {
      throw new BadRequestException(`Un cycle ne peut pas dépasser ${PLAN_MAX_WEEKS} semaines`);
    }

    await this.createWeeks(this.db, planId, plan.athleteId, [input], weekCount + 1);
    return this.getDto(planId);
  }

  async updateWeek(weekId: string, input: UpdatePlanWeekInput): Promise<PlanDto> {
    const week = await this.getWeekOwnedOrThrow(weekId);

    const data: Prisma.PlanWeekUpdateInput = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.note !== undefined) data.note = input.note;

    await this.db.planWeek.update({ where: { id: weekId }, data });
    return this.getDto(week.planId);
  }

  /**
   * Retirer une semaine du milieu du cycle renumérote les suivantes — et fait donc **remonter**
   * leurs séances d'une semaine : sans ce décalage, une séance resterait datée d'une semaine
   * qui n'est plus la sienne.
   */
  async deleteWeek(weekId: string): Promise<PlanDto> {
    const week = await this.getWeekOwnedOrThrow(weekId);

    await this.db.$transaction(async (tx) => {
      // Les séances de la semaine supprimée partent en cascade (schéma).
      await tx.planWeek.delete({ where: { id: weekId } });

      const following = await tx.planWeek.findMany({
        where: { planId: week.planId, weekNumber: { gt: week.weekNumber } },
        orderBy: { weekNumber: "asc" },
      });
      for (const next of following) {
        await tx.planWeek.update({
          where: { id: next.id },
          data: { weekNumber: next.weekNumber - 1 },
        });
        await this.shiftSessions(tx, { planWeekId: next.id }, -DAYS_PER_WEEK);
      }
    });

    return this.getDto(week.planId);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Charge un plan du coach courant, ou lève 404 (scope coachId appliqué par le tenancy layer).
   * Public : le service des séances planifiées s'appuie dessus — un seul contrôle
   * d'appartenance, un seul message, pas deux implémentations à garder en phase.
   */
  async getOwnedOrThrow(id: string): Promise<PlanWithWeeks> {
    const plan = await this.db.plan.findFirst({ where: { id }, include: PLAN_DETAIL_INCLUDE });
    if (plan == null) {
      throw new NotFoundException("Planification introuvable");
    }
    return plan;
  }

  async getWeekOwnedOrThrow(weekId: string): Promise<PlanWeek> {
    const week = await this.db.planWeek.findFirst({ where: { id: weekId } });
    if (week == null) {
      throw new NotFoundException("Semaine introuvable");
    }
    return week;
  }

  private async getDto(id: string): Promise<PlanDto> {
    return toPlanDto(await this.getOwnedOrThrow(id));
  }

  // La relation coach→athlète est scopée par le tenancy layer : un athlète qui n'est pas le sien
  // (ou une relation inactive) ne remonte pas. La FK, elle, n'impose rien — d'où ce contrôle.
  private async assertAthleteOwned(athleteId: string): Promise<void> {
    const relation = await this.db.coachAthlete.findFirst({
      where: { athleteId, status: CoachAthleteStatus.ACTIVE },
    });
    if (relation == null) {
      throw new BadRequestException("Athlète inconnu");
    }
  }

  // Insère des semaines consécutives à partir de `firstWeekNumber` (athleteId dénormalisé
  // explicitement : l'extension n'injecte que le champ tenant de l'acteur, ici coachId).
  private async createWeeks(
    tx: TenantTx | TenantPrisma,
    planId: string,
    athleteId: string,
    weeks: PlanWeekInput[],
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
  private async shiftSessions(
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
}
