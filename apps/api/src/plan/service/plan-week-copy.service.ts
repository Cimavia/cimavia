import type { CopyPlanWeekInput, PlanDto } from "@cmv/shared";
import { PlanStatus, planWeekCopyShiftDays } from "@cmv/shared";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { shiftDbDate, toIsoDate } from "../../util/date.util";
import {
  parseAdjustments,
  parseBlocks,
  parseCustomMetrics,
  parseInstructions,
} from "../../util/exercise-json.util";
import { SESSION_DETAIL_INCLUDE } from "../scheduled-session.mapper";
import { insertScheduledSessionExercises } from "../scheduled-session.writer";
import { PlanService } from "./plan.service";

/**
 * Copier le contenu d'une semaine vers une autre (#4) — même cycle ou cycle différent, y compris
 * pour un autre athlète.
 *
 * Ce que la copie emporte : ce que le COACH a composé (type et note de semaine, séances, consignes,
 * exercices, documents). Ce qu'elle laisse : tout ce qui appartient à l'athlète ou à l'exécution —
 * le `status` (une séance collée est `PLANNED`, jamais `DONE`), les débriefs et leurs médias, les
 * messages rattachés. Le contenu copié est le même que le cycle source soit brouillon ou diffusé.
 *
 * Les DATES ne sont pas recopiées : elles se recalculent depuis le lundi de la semaine cible
 * (`planWeekCopyShiftDays`). Une séance du mardi reste le mardi, mais celui de la semaine
 * d'arrivée — sans quoi elle sortirait de la plage de sa semaine (invariant de service).
 */
@Injectable()
export class PlanWeekCopyService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    // Contrôles d'appartenance du cycle et de la semaine : source unique (PlanService).
    private readonly plans: PlanService,
  ) {}

  async copyWeek(targetWeekId: string, input: CopyPlanWeekInput): Promise<PlanDto> {
    const target = await this.plans.getWeekOwnedOrThrow(targetWeekId);
    const targetPlan = await this.plans.getOwnedOrThrow(target.planId);

    /**
     * Coller dans un cycle DIFFUSÉ est refusé (#4). Ce n'est pas une limite technique : chaque
     * séance écrite notifierait l'athlète séparément (`notifyPlanSessionAdded`), et rien ne groupe
     * ces notifications aujourd'hui (dette N-6, #98). Coller une semaine de cinq séances lui
     * enverrait cinq notifications et cinq push. Tant que #98 n'a pas atterri, le geste n'existe
     * pas sur un cycle diffusé — plutôt que d'exister en harcelant.
     */
    if (targetPlan.status === PlanStatus.PUBLISHED) {
      throw new ConflictException("Un cycle diffusé ne peut pas recevoir de copie");
    }

    // Détruire puis recréer à l'identique n'est pas un geste neutre : les nouvelles séances ont de
    // nouveaux id, et les messages qui pointaient sur les anciennes passeraient à null (SetNull).
    if (input.sourcePlanWeekId === targetWeekId) {
      throw new BadRequestException("Une semaine ne peut pas être copiée sur elle-même");
    }

    /**
     * La source est une référence ENTRANTE (elle vient du corps de la requête) : une FK n'impose
     * pas le tenant, donc elle se valide comme possédée avant toute écriture. La requête étant
     * scopée, la semaine d'un autre coach ne remonte pas — et se signale par un **400 « inconnue »**
     * plutôt qu'un 404, qui confirmerait au passage l'existence de l'id (architecture-choice §6).
     */
    const source = await this.db.planWeek.findFirst({ where: { id: input.sourcePlanWeekId } });
    if (source == null) {
      throw new BadRequestException("Semaine source inconnue");
    }
    const sourcePlan = await this.plans.getOwnedOrThrow(source.planId);

    const shiftDays = planWeekCopyShiftDays(
      { planStartDate: toIsoDate(sourcePlan.startDate), weekNumber: source.weekNumber },
      { planStartDate: toIsoDate(targetPlan.startDate), weekNumber: target.weekNumber },
    );
    if (shiftDays == null) {
      throw new Error(`[plan] semaines non situables pour la copie ${source.id} → ${target.id}`);
    }

    // Les `include` imbriqués ne sont pas scopés (architecture-choice §6, piège n°2) : ici ils
    // pendent à des séances déjà filtrées par le tenant, et portent le même tenant par
    // construction — même lecture que `ScheduledSessionService.getOwnedOrThrow`.
    const sessions = await this.db.scheduledSession.findMany({
      where: { planWeekId: source.id },
      include: SESSION_DETAIL_INCLUDE,
      orderBy: [{ scheduledDate: "asc" }, { position: "asc" }],
    });

    await this.db.$transaction(async (tx) => {
      // Le type de semaine fait partie de ce que le coach a composé : une décharge collée sur une
      // semaine restée « entraînement » mentirait sur le volume des séances qu'elle vient de
      // recevoir.
      await tx.planWeek.update({
        where: { id: target.id },
        data: { type: source.type, note: source.note },
      });

      /**
       * Remplacement, jamais fusion (#4). `@@unique([planWeekId, scheduledDate, position])` rend
       * la fusion impossible sans arbitrer : deux semaines portant chacune une séance le mardi en
       * position 0 collisionnent, et renuméroter réordonnerait la journée du coach sans qu'aucune
       * règle ne dise qui passe devant.
       *
       * Exercices et copies de documents partent en cascade. Aucun objet storage n'est supprimé :
       * les copies ne font que partager les clés de la bibliothèque, qui en reste propriétaire.
       */
      await tx.scheduledSession.deleteMany({ where: { planWeekId: target.id } });

      for (const session of sessions) {
        const created = await tx.scheduledSession.create({
          // coachId injecté par le tenancy layer ; athleteId dénormalisé explicitement — celui du
          // plan CIBLE, jamais celui de la source : une copie inter-planification change d'athlète.
          // `status` est laissé à son défaut (PLANNED) : il décrit l'exécution, pas la composition.
          data: {
            athleteId: targetPlan.athleteId,
            planId: targetPlan.id,
            planWeekId: target.id,
            sourceSessionId: session.sourceSessionId,
            title: session.title,
            notes: session.notes,
            // Décalage multiple de 7 (deux lundis) : le jour de semaine tient, et les triplets
            // (semaine, date, position) restent uniques après translation.
            scheduledDate: shiftDbDate(session.scheduledDate, shiftDays),
            position: session.position,
          } satisfies Omit<
            Prisma.ScheduledSessionUncheckedCreateInput,
            "coachId"
          > as Prisma.ScheduledSessionUncheckedCreateInput,
        });

        // Les documents viennent de l'INSTANCE source, pas de la bibliothèque : `sourceExerciseId`
        // peut être null (exercice supprimé de la bibliothèque, SetNull) alors que l'instance porte
        // toujours ses copies. Y repasser les perdrait — c'est le sens de « copie autonome ».
        await insertScheduledSessionExercises(
          tx,
          created.id,
          targetPlan.athleteId,
          // Les tags de l'instance source sont aplatis en noms : le draft attend la forme du DTO,
          // pas les lignes de la table de copie.
          // Consigne et blocs repassent par Zod : ils sortent de Prisma en `JsonValue`, que le
          // draft n'accepte pas — et le faire ICI garde la copie fidèle à l'instance source.
          session.exercises.map((exercise) => ({
            exercise: {
              ...exercise,
              instructions: parseInstructions(exercise.instructions),
              blocks: parseBlocks(exercise.blocks),
              adjustments: parseAdjustments(exercise.adjustments),
              customMetrics: parseCustomMetrics(exercise.customMetrics),
              tags: exercise.tags.map((tag) => tag.name),
            },
            // La copie garde la référence de la source : recopier une semaine ne remet pas les
            // ajustements à zéro, et ne les fige pas non plus comme s'ils étaient le défaut.
            baseline: parseBlocks(exercise.baseline),
            documents: exercise.documents,
          })),
        );
      }
    });

    // Aucune notification : la cible est un brouillon par construction (le cycle diffusé est
    // refusé plus haut), et un brouillon n'existe pas encore pour l'athlète.
    return this.plans.get(targetPlan.id);
  }
}
