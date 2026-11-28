import type {
  InsertPlanWeekInput,
  PlanDto,
  PlanWeekInput,
  UpdatePlanWeekInput,
  VersionQuery,
} from "@cmv/shared";
import { DAYS_PER_WEEK, PLAN_MAX_WEEKS, PlanStatus } from "@cmv/shared";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import {
  assertReadAtVersion,
  deleteAtVersion,
  staleOnCollision,
  writeAtVersion,
} from "../../util/stale-write.util";
import { athleteRecipientOrThrow } from "../plan.recipient";
import { assertWeeksMovable } from "../plan-shift.guard";
import { lockWeeksInOrder, WEEK_NOT_FOUND } from "../plan-week.version";
import { createWeeks, shiftSessions } from "../plan-week.writer";
import { PlanService } from "./plan.service";

/**
 * Les semaines d'un cycle : en ajouter une, la typer ou l'annoter, la retirer. Le collage d'une
 * semaine sur une autre vit à côté (`PlanWeekCopyService`). Chaque geste rend le cycle entier,
 * comme l'en-tête : la grille se redessine d'un seul tenant.
 */
@Injectable()
export class PlanWeekService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    // Contrôles d'accès au plan et à la semaine : source unique (PlanService).
    private readonly plans: PlanService,
    private readonly notifications: NotificationService,
  ) {}

  async addWeek(planId: string, input: PlanWeekInput): Promise<PlanDto> {
    const { plan, context } = await this.plans.getForOrThrow(planId, "write");
    const weekCount = await this.assertRoomForWeek(planId);

    // `plan.athleteId` peut être `null` (brouillon non encore affecté) : la semaine le recopie
    // tel quel, et l'affectation la rattrapera avec le reste du cycle.
    // Sans version (#604) : deux ajouts simultanés visent le même numéro, et le second, refusé
    // par l'unicité, reçoit le 409 d'une grille périmée plutôt qu'un 500.
    await staleOnCollision(() =>
      createWeeks(this.db, planId, plan.athleteId, [input], weekCount + 1),
    );
    return this.plans.getDtoFor(planId, this.db, context);
  }

  /**
   * Insère une semaine AVANT celle de la route (#231) : elle prend son rang, et la suite glisse
   * d'une semaine, séances comprises — un athlète blessé en semaine 3 reprend une semaine plus
   * tard, sans que ce qu'il a déjà fait ne bouge.
   *
   * Brouillon ou cycle diffusé, même geste : rien de ce qui glisse ne doit avoir été fait
   * (`assertWeeksMovable`). Sur un cycle diffusé, l'athlète en est prévenu après le commit — selon
   * le statut relu DANS la transaction : contrairement à l'en-tête, l'insertion n'écrit pas la ligne
   * `Plan` à sa version, et une diffusion arrivée entre-temps passerait sinon sous silence.
   *
   * Sous la version de la semaine de la route, la première à glisser (#604). Les suivantes avancent
   * avec elle — toutes leurs dates changent —, verrouillées dans l'ordre de leur numéro (#689).
   */
  async insertWeekBefore(weekId: string, input: InsertPlanWeekInput): Promise<PlanDto> {
    const week = await this.plans.getWeekOrThrow(weekId);
    const { plan, context } = await this.plans.getForOrThrow(week.planId, "write");
    const expected = new Date(input.expectedUpdatedAt);
    assertReadAtVersion(week.updatedAt, expected);
    await this.assertRoomForWeek(plan.id);
    await assertWeeksMovable(this.db, plan.id, week.weekNumber);

    const following = await this.db.planWeek.findMany({
      where: { planId: plan.id, weekNumber: { gte: week.weekNumber } },
      select: { id: true, weekNumber: true },
      orderBy: { weekNumber: "asc" },
    });

    // Une semaine ajoutée en fin de cycle au même instant vise un numéro que la renumérotation
    // prend : l'unicité refuse l'une des deux, et le refusé reçoit le 409 d'une grille périmée.
    const updated = await staleOnCollision(() =>
      this.db.$transaction(async (tx) => {
        // La semaine de la route est citée en propre, à sa version : retirée depuis la lecture,
        // elle manquerait à `following`, et la suite glisserait sur une grille que le Coach n'a
        // pas vue — 404 plutôt qu'un 201 qui défait le recalage du retrait.
        await lockWeeksInOrder(tx, [
          { id: weekId, weekNumber: week.weekNumber, readAt: expected },
          ...following.filter((next) => next.id !== weekId),
        ]);
        await shiftSessions(
          tx,
          { planWeekId: { in: following.map((next) => next.id) } },
          DAYS_PER_WEEK,
        );
        // Revue sous nos verrous, avant que les rangs ne bougent (cf. `plan-shift.guard`).
        await assertWeeksMovable(tx, plan.id, week.weekNumber);
        await renumberFrom(tx, following);
        await createWeeks(tx, plan.id, plan.athleteId, [input], week.weekNumber);
        return this.plans.getDtoFor(plan.id, tx, context);
      }),
    );

    // Le cycle tel que la transaction l'a relu : statut et destinataire d'après une diffusion.
    if (updated.status === PlanStatus.PUBLISHED) {
      await this.notifications.notifyPlanRescheduled({
        athleteId: athleteRecipientOrThrow(updated),
        planId: plan.id,
        planTitle: updated.title,
        fromWeekNumber: week.weekNumber,
        weeks: 1,
      });
    }
    return updated;
  }

  /** Sous la version de la semaine affichée (#604) — voir `updatePlanWeekSchema`. */
  async updateWeek(weekId: string, input: UpdatePlanWeekInput): Promise<PlanDto> {
    const week = await this.plans.getWeekOrThrow(weekId);
    const { context } = await this.plans.getForOrThrow(week.planId, "write");
    const expected = new Date(input.expectedUpdatedAt);
    assertReadAtVersion(week.updatedAt, expected);

    const data: Prisma.PlanWeekUpdateManyMutationInput = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.note !== undefined) data.note = input.note;
    // Rien à écrire : la version n'avance pas, comme sur l'en-tête du cycle.
    if (Object.keys(data).length === 0) return this.plans.getDtoFor(week.planId, this.db, context);

    return this.db.$transaction(async (tx) => {
      await writeAtVersion(tx.planWeek, weekId, expected, data, WEEK_NOT_FOUND);
      return this.plans.getDtoFor(week.planId, tx, context);
    });
  }

  /**
   * Retirer une semaine du milieu du cycle renumérote les suivantes — et fait donc **remonter**
   * leurs séances d'une semaine : sans ce décalage, une séance resterait datée d'une semaine
   * qui n'est plus la sienne.
   *
   * Tant que le cycle est un BROUILLON (#312). Sur un cycle diffusé, ce décalage ferait REMONTER
   * d'une semaine le planning sur lequel l'athlète s'entraîne, séances débriefées comprises — le
   * même effet qu'avancer `startDate`, que `assertStartMovable` refuse (#231). Et même la dernière
   * semaine, qui ne décale rien, emporterait ses séances et leurs débriefs en cascade.
   *
   * La garde lit le plan AVANT la transaction, comme ses voisines. La placer dans la suppression
   * (#313) ne protégerait de rien ici : le statut vit sur la ligne `Plan`, pas sur celle supprimée,
   * et Postgres ne revérifie pas une condition portée par une autre table.
   */
  async deleteWeek(weekId: string, query: VersionQuery): Promise<PlanDto> {
    const week = await this.plans.getWeekOrThrow(weekId);
    const { plan, context } = await this.plans.getForOrThrow(week.planId, "write");
    const expected = new Date(query.expectedUpdatedAt);
    // Retirer une semaine qu'un autre Coach vient de garnir emporterait ses séances sans qu'on les
    // ait vues (#604) : le conflit passe avant le verrou de diffusion, comme sur l'en-tête.
    assertReadAtVersion(week.updatedAt, expected);
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new ConflictException(
        "Un cycle diffusé ne perd plus de semaine : son athlète s'entraîne dessus",
      );
    }

    await this.db.$transaction(async (tx) => {
      // Les séances de la semaine supprimée partent en cascade (schéma). Sous la version lue :
      // entre la lecture et ici, une séance a pu y être posée.
      await deleteAtVersion(tx.planWeek, weekId, expected, WEEK_NOT_FOUND);

      const following = await tx.planWeek.findMany({
        where: { planId: week.planId, weekNumber: { gt: week.weekNumber } },
        orderBy: { weekNumber: "asc" },
      });
      for (const next of following) {
        await tx.planWeek.update({
          where: { id: next.id },
          data: { weekNumber: next.weekNumber - 1 },
        });
        await shiftSessions(tx, { planWeekId: next.id }, -DAYS_PER_WEEK);
      }
    });

    return this.plans.getDtoFor(week.planId, this.db, context);
  }

  /** Le nombre de semaines du cycle, s'il en accueille une de plus — 400 sinon. */
  private async assertRoomForWeek(planId: string): Promise<number> {
    const weekCount = await this.db.planWeek.count({ where: { planId } });
    if (weekCount >= PLAN_MAX_WEEKS) {
      throw new BadRequestException(`Un cycle ne peut pas dépasser ${PLAN_MAX_WEEKS} semaines`);
    }
    return weekCount;
  }
}

/**
 * Fait reculer d'un rang les semaines données, de la DERNIÈRE à la première : `@@unique([planId,
 * weekNumber])` n'est pas différable, et la semaine 4 ne peut devenir 5 qu'une fois la 5 devenue 6.
 */
async function renumberFrom(
  tx: TenantTx,
  weeks: readonly { id: string; weekNumber: number }[],
): Promise<void> {
  for (const week of [...weeks].reverse()) {
    await tx.planWeek.update({ where: { id: week.id }, data: { weekNumber: week.weekNumber + 1 } });
  }
}
