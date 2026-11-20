import type { PlanDto, PlanWeekInput, UpdatePlanWeekInput, VersionQuery } from "@cmv/shared";
import { DAYS_PER_WEEK, PLAN_MAX_WEEKS, PlanStatus } from "@cmv/shared";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import {
  assertReadAtVersion,
  deleteAtVersion,
  staleOnCollision,
  writeAtVersion,
} from "../../util/stale-write.util";
import { WEEK_NOT_FOUND } from "../plan-week.version";
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
  ) {}

  async addWeek(planId: string, input: PlanWeekInput): Promise<PlanDto> {
    const { plan, context } = await this.plans.getForOrThrow(planId, "write");

    const weekCount = await this.db.planWeek.count({ where: { planId } });
    if (weekCount >= PLAN_MAX_WEEKS) {
      throw new BadRequestException(`Un cycle ne peut pas dépasser ${PLAN_MAX_WEEKS} semaines`);
    }

    // `plan.athleteId` peut être `null` (brouillon non encore affecté) : la semaine le recopie
    // tel quel, et l'affectation la rattrapera avec le reste du cycle.
    // Sans version (#604) : deux ajouts simultanés visent le même numéro, et le second, refusé
    // par l'unicité, reçoit le 409 d'une grille périmée plutôt qu'un 500.
    await staleOnCollision(() =>
      createWeeks(this.db, planId, plan.athleteId, [input], weekCount + 1),
    );
    return this.plans.getDtoFor(planId, this.db, context);
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
   * Tant que le cycle est un BROUILLON (#312). Sur un cycle diffusé, ce décalage ferait glisser
   * d'une semaine le planning sur lequel l'athlète s'entraîne, séances débriefées comprises — le
   * même effet que réécrire `startDate`, que `assertHeaderWritable` refuse déjà. Et même la
   * dernière semaine, qui ne décale rien, emporterait ses séances et leurs débriefs en cascade.
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
}
