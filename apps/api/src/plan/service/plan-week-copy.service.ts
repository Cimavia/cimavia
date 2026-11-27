import type { CopyPlanWeekInput, PlanDto } from "@cmv/shared";
import { PlanStatus, planWeekCopyShiftDays, required } from "@cmv/shared";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toIsoDate } from "../../util/date.util";
import { assertReadAtVersion, writeAtVersion } from "../../util/stale-write.util";
import { WEEK_NOT_FOUND } from "../plan-week.version";
import { copyScheduledSessions } from "../scheduled-session.copier";
import { SESSION_DETAIL_INCLUDE } from "../scheduled-session.mapper";
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
    // Contrôles d'accès au cycle et à la semaine : source unique (PlanService).
    private readonly plans: PlanService,
  ) {}

  async copyWeek(targetWeekId: string, input: CopyPlanWeekInput): Promise<PlanDto> {
    const target = await this.plans.getWeekOrThrow(targetWeekId);
    // Coller écrit dans le cycle CIBLE : il faut pouvoir l'écrire (#607). La source, elle, se lit.
    const { plan: targetPlan } = await this.plans.getForOrThrow(target.planId, "write");
    const expected = new Date(input.expectedUpdatedAt);
    // Coller REMPLACE le contenu de la cible : sur une semaine qu'un autre Coach a garnie depuis
    // qu'on l'a vue, ce serait effacer son travail sans l'avoir vu (#604).
    assertReadAtVersion(target.updatedAt, expected);

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
     * pas le tenant, donc elle se valide comme lisible avant toute écriture — la sienne, ou celle
     * d'un cycle qu'on lui ouvre (#607). La requête étant scopée, une semaine illisible ne remonte
     * pas — et se signale par un **400 « inconnue »**
     * plutôt qu'un 404, qui confirmerait au passage l'existence de l'id (architecture-choice §6).
     */
    const source = await this.db.planWeek.findFirst({ where: { id: input.sourcePlanWeekId } });
    if (source == null) {
      throw new BadRequestException("Semaine source inconnue");
    }
    const sourcePlan = await this.plans.getReadableOrThrow(source.planId);

    // Deux semaines lues en base : `weekNumber` ≥ 1 et `startDate` valide des deux côtés.
    const shiftDays = required(
      planWeekCopyShiftDays(
        { planStartDate: toIsoDate(sourcePlan.startDate), weekNumber: source.weekNumber },
        { planStartDate: toIsoDate(targetPlan.startDate), weekNumber: target.weekNumber },
      ),
      `[plan] semaines non situables pour la copie ${source.id} → ${target.id}`,
    );

    // Les `include` imbriqués ne sont pas scopés (architecture-choice §6, piège n°2) : ici ils
    // pendent à des séances déjà filtrées par le tenant, et portent le même tenant par
    // construction — même lecture que `ScheduledSessionService.getReadableOrThrow`.
    const sessions = await this.db.scheduledSession.findMany({
      where: { planWeekId: source.id },
      include: SESSION_DETAIL_INCLUDE,
      orderBy: [{ scheduledDate: "asc" }, { position: "asc" }],
    });

    await this.db.$transaction(async (tx) => {
      // Le type de semaine fait partie de ce que le coach a composé : une décharge collée sur une
      // semaine restée « entraînement » mentirait sur le volume des séances qu'elle vient de
      // recevoir.
      // Sous la version lue : la garde, et l'avancée que voit le geste suivant.
      await writeAtVersion(
        tx.planWeek,
        target.id,
        expected,
        { type: source.type, note: source.note },
        WEEK_NOT_FOUND,
      );

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

      await copyScheduledSessions(
        tx,
        sessions,
        { planId: targetPlan.id, planWeekId: target.id, athleteId: targetPlan.athleteId },
        shiftDays,
      );
    });

    // Aucune notification : la cible est un brouillon par construction (le cycle diffusé est
    // refusé plus haut), et un brouillon n'existe pas encore pour l'athlète.
    return this.plans.get(targetPlan.id);
  }
}
