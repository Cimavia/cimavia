import type { DuplicatePlanInput, PlanDto } from "@cmv/shared";
import { daysBetweenIsoDates, planFollowingStartDate, required } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toDbDate, toIsoDate } from "../../util/date.util";
import { createWeeks } from "../plan-week.writer";
import { copyScheduledSessions } from "../scheduled-session.copier";
import {
  type ScheduledSessionWithExercises,
  SESSION_DETAIL_INCLUDE,
} from "../scheduled-session.mapper";
import { PlanService } from "./plan.service";

/**
 * Le plafond par défaut de Prisma (5 s) est taillé pour une écriture de quelques lignes : un cycle
 * en écrit des milliers. Écrites par lots (`copyScheduledSessions`, une requête par table), elles
 * tiennent en 1,4 s en local (18 s ligne à ligne) pour 52 semaines — la borne — de cinq séances de
 * six exercices. Le plafond garde la marge d'un NAS plus lent.
 */
export const DUPLICATE_TRANSACTION = { timeout: 15_000, maxWait: 5_000 };

/**
 * Dupliquer un cycle (#5) : un nouveau BROUILLON, au Coach qui duplique, qui reprend ce que le
 * cycle source a composé — semaines (type et note), séances, consignes, blocs, exercices,
 * documents, tags — semaine par semaine, par le même copieur que la copie de semaine (#4).
 *
 * La source n'a qu'à être LISIBLE : la sienne, un cycle qu'un autre Coach lui ouvre (#607), une
 * archive de suivi terminé (#909), brouillon ou diffusée. Lire ne la mute pas, et « reprendre le
 * cycle d'un athlète parti pour un autre » est le cas d'usage même.
 *
 * Ce que la copie ne reprend pas, chacun pour sa raison :
 *  - **l'athlète** : elle naît sans destinataire (#144), et le Coach le choisit dans l'en-tête.
 *    L'athlète de la source n'est pas forcément le sien (cycle ouvert) ni encore suivi (archive) ;
 *  - **la date de début** : le lundi qui suit la fin de la source (`planFollowingStartDate`) —
 *    la copie enchaîne le bloc suivant au lieu de se superposer à sa source ;
 *  - **la facture** : 1:1 avec son cycle (P6), datée, et son justificatif nomme un athlète (#472) ;
 *  - **les accès** : ils s'ouvrent à l'affectation, sur l'entreprise du nouvel athlète, comme à la
 *    création (#607) — recopiés, ils ouvriraient la copie aux Coachs de l'ancien ;
 *  - **l'exécution** : statut, débriefs, médias et messages (cf. `copyScheduledSessions`).
 *
 * Aucune notification : un brouillon n'existe pas encore pour personne.
 */
@Injectable()
export class PlanDuplicateService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    // Contrôle de lecture du cycle source et forme rendue : source unique (PlanService).
    private readonly plans: PlanService,
  ) {}

  async duplicate(id: string, input: DuplicatePlanInput): Promise<PlanDto> {
    // 404 sur un cycle illisible : il ne dit rien de son existence (architecture-choice §6).
    const source = await this.plans.getReadableOrThrow(id);
    const sourceStart = toIsoDate(source.startDate);

    /**
     * La source se lit DANS la transaction, sous un seul instantané (lecture répétable) : un autre
     * Coach qui l'écrit (#607) peut ajouter une semaine ou y coller pendant la copie. Lues en deux
     * temps, semaines et séances ne décriraient pas le même cycle — une séance de la semaine
     * ajoutée n'aurait nulle part où aller. Aucun conflit à craindre : on n'écrit que des lignes
     * neuves, jamais celles qu'on lit.
     */
    const created = await this.db.$transaction(
      async (tx) => {
        // Les semaines d'un cycle sont contiguës depuis 1 : leur rang ici EST leur numéro.
        const weeks = await tx.planWeek.findMany({
          where: { planId: source.id },
          orderBy: { weekNumber: "asc" },
        });
        // Les `include` imbriqués ne sont pas scopés (architecture-choice §6, piège n°2) : ils
        // pendent à des séances déjà filtrées par le tenant — même lecture que la copie de semaine.
        const sessions = await tx.scheduledSession.findMany({
          where: { planId: source.id },
          include: SESSION_DETAIL_INCLUDE,
          orderBy: [{ scheduledDate: "asc" }, { position: "asc" }],
        });

        // Un lundi lu en base, un nombre de semaines compté : toujours situable.
        const startDate = required(
          planFollowingStartDate(sourceStart, weeks.length),
          `[plan] début de copie non calculable pour le plan ${source.id}`,
        );
        const shiftDays = required(
          daysBetweenIsoDates(sourceStart, startDate),
          `[plan] décalage de copie non calculable pour le plan ${source.id}`,
        );

        // coachId injecté par le tenancy layer : la copie appartient à qui la fait, jamais au
        // propriétaire de la source.
        const plan = await tx.plan.create({
          data: {
            athleteId: null,
            title: input.title,
            description: source.description,
            startDate: toDbDate(startDate),
          } satisfies Omit<
            Prisma.PlanUncheckedCreateInput,
            "coachId"
          > as Prisma.PlanUncheckedCreateInput,
        });
        await createWeeks(
          tx,
          plan.id,
          null,
          weeks.map((week) => ({ type: week.type, note: week.note })),
          1,
        );
        const copies = await tx.planWeek.findMany({
          where: { planId: plan.id },
          orderBy: { weekNumber: "asc" },
          select: { id: true },
        });
        // La semaine N de la source → la semaine N de la copie.
        const copyOf = new Map(weeks.map((week, index) => [week.id, copies[index]?.id]));

        // Chaque semaine reçoit les séances de sa source, décalées d'autant de jours que le cycle.
        // Une séance sans semaine copiée échoue, elle ne se perd pas.
        await copyScheduledSessions(
          tx,
          [...groupByWeek(sessions)].map(([weekId, weekSessions]) => ({
            sessions: weekSessions,
            target: {
              planId: plan.id,
              planWeekId: required(copyOf.get(weekId), `[plan] semaine ${weekId} non recopiée`),
              athleteId: null,
            },
          })),
          shiftDays,
        );
        return plan;
      },
      {
        ...DUPLICATE_TRANSACTION,
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );

    return this.plans.get(created.id);
  }
}

/** Les séances rangées par semaine, dans l'ordre de lecture (date, puis rang du jour). */
function groupByWeek(
  sessions: readonly ScheduledSessionWithExercises[],
): ReadonlyMap<string, ScheduledSessionWithExercises[]> {
  const byWeek = new Map<string, ScheduledSessionWithExercises[]>();
  for (const session of sessions) {
    const week = byWeek.get(session.planWeekId);
    if (week == null) byWeek.set(session.planWeekId, [session]);
    else week.push(session);
  }
  return byWeek;
}
