import type { PlanDto, ReorderPlanDayInput } from "@cmv/shared";
import { PlanStatus } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Plan } from "@prisma/client";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toDbDate } from "../../util/date.util";
import { assertReadAtVersion } from "../../util/stale-write.util";
import { athleteRecipientOrThrow } from "../plan.recipient";
import { lockWeeksInOrder } from "../plan-week.version";
import { assertDateInWeek, assertDayContent } from "../scheduled-day.rules";
import { compactDay, writeDay } from "../scheduled-session.position";
import { PlanService } from "./plan.service";

/**
 * Une JOURNÉE du cycle, vue comme un tout : les séances qu'elle porte et leur ordre. Le geste de la
 * grille (glisser, réordonner) — l'édition d'une séance seule reste à `ScheduledSessionService`.
 */
@Injectable()
export class ScheduledDayService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    // Contrôles d'accès au plan et à la semaine : source unique (PlanService).
    private readonly plans: PlanService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Le CONTENU d'une journée et son ordre (#148, élargi en #93) — replace-all : le tableau reçu
   * définit ce que la journée porte, et dans quel ordre.
   *
   * Il peut donc citer une séance posée un autre jour du MÊME cycle, dans n'importe laquelle de ses
   * semaines (#689) : elle y est déplacée, au rang exact où le tableau la place, et change de
   * semaine avec sa date. C'est le pendant serveur du glisser d'une case à l'autre, et ça reste le
   * même geste que le sélecteur « Jour » du panneau de séance — d'où la même annonce
   * (`PLAN_UPDATED`), et non celle du réordonnancement.
   *
   * La version citée est celle de la semaine d'ARRIVÉE : c'est la journée que le client a lue
   * pour composer le tableau. Les semaines de départ avancent sans condition (`lockWeeksInOrder`).
   *
   * Réordonner reste autorisé sur un cycle DIFFUSÉ, contrairement au collage de semaine (#4) qui
   * s'y refuse : la différence n'est pas le statut, c'est le nombre d'écritures. Un collage émet
   * une notification par séance et rien ne les groupe (dette N-6) ; ici le geste est UN.
   */
  async reorderDay(
    planWeekId: string,
    isoDate: string,
    input: ReorderPlanDayInput,
  ): Promise<PlanDto> {
    const week = await this.plans.getWeekOrThrow(planWeekId);
    const { plan } = await this.plans.getForOrThrow(week.planId, "write");
    const expected = new Date(input.expectedUpdatedAt);
    // Avant de juger le tableau : fondé sur une grille périmée, il ne correspond plus à la journée,
    // et le refus serait un 400 « contenu invalide » au lieu de proposer de relire (#604).
    assertReadAtVersion(week.updatedAt, expected);
    assertDateInWeek(plan, week, isoDate);

    // Le jour visé, et les séances citées où qu'elles soient dans le CYCLE : une autre journée,
    // une autre semaine (#689). Pas un autre cycle : changer de cycle peut changer d'athlète, donc
    // de destinataire. Scopé au coach courant par l'extension tenant — une séance d'un autre coach
    // n'y figure pas, et les contrôles ci-dessous la refusent comme étrangère au cycle.
    const date = toDbDate(isoDate);
    const cycleSessions = await this.db.scheduledSession.findMany({
      where: { planId: plan.id, OR: [{ scheduledDate: date }, { id: { in: input.sessionIds } }] },
      select: {
        id: true,
        position: true,
        scheduledDate: true,
        title: true,
        planWeek: { select: { id: true, weekNumber: true, updatedAt: true } },
      },
      orderBy: { position: "asc" },
    });

    const ordered = assertDayContent(cycleSessions, input.sessionIds, date);

    const moved = ordered.filter((session) => session.scheduledDate.getTime() !== date.getTime());
    // Comparer l'état RÉSULTANT, jamais le fait qu'une requête soit passée : le `PUT` est
    // idempotent, et renvoyer l'ordre déjà en place ne dérange pas l'athlète (même règle que le
    // `readAt` de #105).
    const reordered = ordered.some((session, index) => session.position !== index);

    if (moved.length > 0 || reordered) {
      // Les jours d'origine, avant écriture : après, les séances n'y sont plus et on ne saurait
      // plus lesquels recoller. Une date n'appartient qu'à une semaine du cycle : la clé suffit.
      const sources = new Map(
        moved.map((session) => [
          session.scheduledDate.getTime(),
          { planWeekId: session.planWeek.id, date: session.scheduledDate },
        ]),
      );

      await this.db.$transaction(async (tx) => {
        // Chaque semaine sous la version LUE : celle que le client cite pour l'arrivée (déjà
        // comparée ci-dessus), celle de la lecture ci-dessus pour les départs — les jours à
        // recoller en ont été déduits, et ne valent que si personne ne les a changés depuis.
        await lockWeeksInOrder(tx, [
          { id: week.id, weekNumber: week.weekNumber, readAt: expected },
          ...moved.map(({ planWeek }) => ({
            id: planWeek.id,
            weekNumber: planWeek.weekNumber,
            readAt: planWeek.updatedAt,
          })),
        ]);
        await writeDay(tx, ordered, planWeekId, date);
        for (const source of sources.values()) {
          await compactDay(tx, source.planWeekId, source.date);
        }
      });

      if (plan.status === PlanStatus.PUBLISHED) {
        await this.announce(plan, isoDate, moved);
      }
    }

    return this.plans.get(plan.id);
  }

  /**
   * Ce que l'athlète apprend d'un geste sur sa journée.
   *
   * Une séance DÉPLACÉE prime sur l'ordre : lui dire que sa journée a été réordonnée quand sa
   * séance est passée au mardi l'enverrait chercher au mauvais endroit — le raisonnement même qui
   * a fait distinguer les quatre types d'ajustement plutôt que les fondre en un seul.
   *
   * Un seul déplacement par geste dans l'interface : la boucle sert le cas où l'API est appelée
   * autrement, et la dette N-6 (aucun groupement) ne mord pas sur un tableau qui en porte un.
   */
  private async announce(
    plan: Plan,
    isoDate: string,
    moved: readonly { title: string }[],
  ): Promise<void> {
    const athleteId = athleteRecipientOrThrow(plan);

    if (moved.length === 0) {
      await this.notifications.notifyPlanSessionsReordered({
        athleteId,
        planId: plan.id,
        isoDate,
      });
      return;
    }

    for (const session of moved) {
      await this.notifications.notifyPlanUpdated({
        athleteId,
        planId: plan.id,
        sessionTitle: session.title,
      });
    }
  }
}
