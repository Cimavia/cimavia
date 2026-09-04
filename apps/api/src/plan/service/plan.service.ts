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
  PlanStatus,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Plan, PlanWeek, Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { InvoiceService } from "../../invoice/service/invoice.service";
import { NotificationService } from "../../notification/notification.service";
import { ReminderService } from "../../reminder/service/reminder.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor } from "../../tenancy/tenant-context.type";
import { shiftDbDate, toDbDate, toIsoDate } from "../../util/date.util";
import {
  PLAN_COUNTS_INCLUDE,
  PLAN_DETAIL_INCLUDE,
  type PlanWithWeeks,
  toPlanDto,
  toPlanSummaryDto,
} from "../plan.mapper";

export type ListPlansFilters = { athleteId?: string };

@Injectable()
export class PlanService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly notifications: NotificationService,
    private readonly invoices: InvoiceService,
    private readonly reminders: ReminderService,
    private readonly cls: ClsService,
  ) {}

  async create(input: CreatePlanInput): Promise<PlanDto> {
    // Sans destinataire (#144), il n'y a rien à valider : c'est un cycle qu'on prépare avant de
    // savoir pour qui, et `publish` réclamera l'athlète le moment venu.
    const athleteId = input.athleteId ?? null;
    if (athleteId != null) {
      await this.assertAthleteOwned(athleteId);
    }

    const plan = await this.db.$transaction(async (tx) => {
      // coachId injecté par le tenancy layer (extension Prisma) — d'où le cast.
      const created = await tx.plan.create({
        data: {
          athleteId,
          title: input.title,
          description: input.description ?? null,
          startDate: toDbDate(input.startDate),
        } satisfies Omit<
          Prisma.PlanUncheckedCreateInput,
          "coachId"
        > as Prisma.PlanUncheckedCreateInput,
      });
      await this.createWeeks(tx, created.id, athleteId, input.weeks, 1);
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

    // Forme UNCHECKED : `athleteId` s'écrit en scalaire, comme partout ailleurs sur cette chaîne
    // dénormalisée. La forme relationnelle demanderait un `connect`/`disconnect` là où le reste
    // du module raisonne en identifiants.
    const data: Prisma.PlanUncheckedUpdateInput = {};
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

    // `undefined` = ne touche pas au destinataire ; `null` = le détacher. Les deux se
    // distinguent, et c'est toute la raison d'être du `nullable().optional()` du schéma.
    const reassigned = input.athleteId !== undefined;
    if (reassigned) {
      await this.assertReassignable(plan, input.athleteId ?? null);
      data.athleteId = input.athleteId ?? null;
    }

    await this.db.$transaction(async (tx) => {
      await tx.plan.update({ where: { id }, data });
      if (shiftDays !== 0) {
        await this.shiftSessions(tx, { planId: id }, shiftDays);
      }
      if (reassigned) {
        await this.propagateAthlete(tx, id, input.athleteId ?? null);
      }
    });

    return this.getDto(id);
  }

  /**
   * Ce qu'un changement de destinataire exige AVANT d'être écrit.
   *
   * Un cycle diffusé n'en change plus : son athlète a été notifié, s'entraîne dessus, et sa
   * facture est émise à son nom. Le refus est un 409 et non un 400 — ce n'est pas la demande qui
   * est mal formée, c'est l'état du cycle qui ne s'y prête plus.
   */
  private async assertReassignable(plan: Plan, athleteId: string | null): Promise<void> {
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new ConflictException(
        "Le destinataire d'un cycle diffusé ne change plus : il en a déjà été prévenu",
      );
    }
    if (athleteId != null) {
      await this.assertAthleteOwned(athleteId);
      return;
    }
    await this.invoices.assertPlanDetachable(plan.id);
  }

  /**
   * Le destinataire descend sur TOUTE la chaîne de planification, dans la transaction de
   * l'affectation. Un cycle à moitié affecté est un cycle dont la moitié des séances reste
   * invisible de son athlète — une panne silencieuse, et la pire qui soit ici.
   *
   * SIX tables, parce que l'extension tenant filtre par un champ du modèle INTERROGÉ et ne sait
   * pas remonter la relation. Les trois dernières ne portent pas `planId` : on descend donc par
   * identifiants collectés plutôt que par filtre relationnel imbriqué, dont le SQL n'est
   * vérifiable qu'à l'exécution — sur un invariant de tenant, on préfère le chemin qui se lit.
   *
   * La facture brouillon suit dans le même mouvement (`followPlanAthlete`), sans quoi elle serait
   * émise au nom du destinataire précédent.
   */
  private async propagateAthlete(
    tx: TenantTx,
    planId: string,
    athleteId: string | null,
  ): Promise<void> {
    await tx.planWeek.updateMany({ where: { planId }, data: { athleteId } });
    await tx.scheduledSession.updateMany({ where: { planId }, data: { athleteId } });
    if (athleteId != null) {
      await this.invoices.followPlanAthlete(tx, planId, athleteId);
    }

    const sessions = await tx.scheduledSession.findMany({
      where: { planId },
      select: { id: true },
    });
    if (sessions.length === 0) return;

    const inSessions = { scheduledSessionId: { in: sessions.map((session) => session.id) } };
    await tx.scheduledSessionExercise.updateMany({ where: inSessions, data: { athleteId } });

    const exercises = await tx.scheduledSessionExercise.findMany({
      where: inSessions,
      select: { id: true },
    });
    if (exercises.length === 0) return;

    const inExercises = {
      scheduledSessionExerciseId: { in: exercises.map((exercise) => exercise.id) },
    };
    await tx.scheduledSessionExerciseDocument.updateMany({
      where: inExercises,
      data: { athleteId },
    });
    await tx.scheduledSessionExerciseTag.updateMany({ where: inExercises, data: { athleteId } });
  }

  async delete(id: string): Promise<void> {
    await this.getOwnedOrThrow(id);
    // Semaines, séances, exercices et copies de documents partent en cascade (schéma). Les objets
    // S3 ne sont PAS touchés : ils appartiennent à la bibliothèque, les copies les partagent.
    //
    // Les RAPPELS, eux, n'ont pas de clé étrangère vers leur cible (référence polymorphe) : rien en
    // base ne les emporte. On les purge donc explicitement, dans la MÊME transaction — sinon un
    // rappel « relancer ce cycle » survivrait au cycle et ne mènerait plus nulle part (#44).
    await this.db.$transaction(async (tx) => {
      await this.reminders.purgeForPlan(tx, id);
      await tx.plan.delete({ where: { id } });
    });
  }

  /**
   * Diffusion : DRAFT → PUBLISHED. C'est le seul moment où le plan devient visible de l'athlète
   * (les lectures athlète filtrent sur PUBLISHED). Pas de retour arrière en MVP : une fois
   * diffusé, le cycle s'ajuste en place (CDC §5.7), il ne repasse pas en brouillon.
   *
   * La facture du cycle est ÉMISE ici, atomiquement : passage PUBLISHED et DRAFT → PENDING dans la
   * même transaction. Sans termes de facturation saisis, `issueForPlan` lève (400) et rien n'est
   * diffusé — c'est le gating (P6). L'athlète reçoit alors deux notifications : cycle + facture.
   */
  async publish(id: string): Promise<PlanDto> {
    const plan = await this.getOwnedOrThrow(id);
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new ConflictException("Planification déjà diffusée");
    }

    /**
     * Le destinataire d'abord, avant le contenu et avant la facturation (#144). L'ordre n'est pas
     * cosmétique : un cycle sans athlète NI facturation échouerait sinon sur le message de
     * facturation, qui ne dit pas ce qui manque vraiment — et le coach chercherait un montant à
     * saisir là où il lui manque quelqu'un à qui parler.
     *
     * C'est aussi ce qui rend non-null tout ce qui suit : notifications et facture s'appuient
     * dessus, et `athleteRecipientOrThrow` garde les chemins que ce contrôle ne domine pas.
     */
    if (plan.athleteId == null) {
      throw new BadRequestException("Choisis l'athlète de ce cycle avant de le diffuser");
    }

    const weekCount = await this.db.planWeek.count({ where: { planId: id } });
    if (weekCount === 0) {
      throw new BadRequestException("Un cycle sans semaine n'a rien à diffuser");
    }

    /**
     * Auto-coaching (#14) : pas de facture. Le gating existe pour qu'un coach ne diffuse pas un
     * cycle sans avoir dit ce qu'il coûte à SON ATHLÈTE — se le facturer à soi-même n'aurait
     * aucun sens, et l'exiger rendrait la diffusion solo impossible. Les notifications, elles,
     * sont filtrées plus bas par `NotificationService` : la règle « on ne s'annonce pas à
     * soi-même » y vaut pour tous les émetteurs, pas seulement pour celui-ci.
     *
     * La state machine `DRAFT → PUBLISHED`, elle, ne change PAS : c'est elle qui donne au cycle
     * ses `ScheduledSession` lisibles et débriefables, et un cycle solo doit se vivre comme les
     * autres.
     */
    const solo = this.isSelfCoaching(plan);

    const invoice = await this.db.$transaction(async (tx) => {
      await tx.plan.update({
        where: { id },
        data: { status: PlanStatus.PUBLISHED, publishedAt: new Date() },
      });
      // Gating : lève si aucune facturation n'a été saisie → la transaction est annulée.
      return solo ? null : await this.invoices.issueForPlan(tx, plan);
    });

    // Pas de garde `solo` ici : `NotificationService` ignore déjà toute notification vers soi-même
    // (#14), et pour TOUS les émetteurs. Une règle, un endroit.
    await this.notifications.notifyPlanPublished({
      athleteId: plan.athleteId,
      planId: plan.id,
      planTitle: plan.title,
    });
    if (invoice != null) {
      await this.notifications.notifyInvoiceIssued({
        athleteId: plan.athleteId,
        invoiceId: invoice.id,
      });
    }

    return this.getDto(id);
  }

  // ── Semaines ───────────────────────────────────────────────────────────────

  async addWeek(planId: string, input: PlanWeekInput): Promise<PlanDto> {
    const plan = await this.getOwnedOrThrow(planId);

    const weekCount = await this.db.planWeek.count({ where: { planId } });
    if (weekCount >= PLAN_MAX_WEEKS) {
      throw new BadRequestException(`Un cycle ne peut pas dépasser ${PLAN_MAX_WEEKS} semaines`);
    }

    // `plan.athleteId` peut être `null` (brouillon non encore affecté) : la semaine le recopie
    // tel quel, et l'affectation la rattrapera avec le reste du cycle.
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
  async getOwnedOrThrow(id: string): Promise<Plan> {
    const plan = await this.db.plan.findFirst({ where: { id } });
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

  // Le plan complet (semaines + séances) — la forme rendue par l'API après chaque écriture.
  private async getDetailOrThrow(id: string): Promise<PlanWithWeeks> {
    const plan = await this.db.plan.findFirst({ where: { id }, include: PLAN_DETAIL_INCLUDE });
    if (plan == null) {
      throw new NotFoundException("Planification introuvable");
    }
    return plan;
  }

  private async getDto(id: string): Promise<PlanDto> {
    return toPlanDto(await this.getDetailOrThrow(id));
  }

  /**
   * La relation coach→athlète est scopée par le tenancy layer : un athlète qui n'est pas le sien
   * (ou une relation inactive) ne remonte pas. La FK, elle, n'impose rien — d'où ce contrôle.
   *
   * **Soi-même est le seul athlète sans relation** (auto-coaching, #14) : un coach qui se coache
   * n'a pas de ligne `CoachAthlete`, et ne peut pas en avoir (CHECK `coach_athlete_not_self`, #11).
   * La capacité athlète est donc exigée explicitement — sans elle, un coach pur se créerait des
   * cycles qu'il ne pourrait jamais lire, la lecture passant par les routes athlète.
   */
  private async assertAthleteOwned(athleteId: string): Promise<void> {
    const actor = currentActor(this.cls);
    if (athleteId === actor.userId) {
      if (!actor.capabilities.isAthlete) {
        throw new BadRequestException("Athlète inconnu");
      }
      return;
    }

    const relation = await this.db.coachAthlete.findFirst({
      where: { athleteId, status: CoachAthleteStatus.ACTIVE },
    });
    if (relation == null) {
      throw new BadRequestException("Athlète inconnu");
    }
  }

  /**
   * Un cycle que le coach s'est écrit à lui-même : ni facture, ni notification (#14).
   *
   * Un cycle SANS destinataire (#144) n'est pas solo — mais `publish` l'a déjà refusé bien avant
   * d'arriver ici, ce qui est le seul endroit d'où cette question se pose.
   */
  private isSelfCoaching(plan: { coachId: string; athleteId: string | null }): boolean {
    return plan.athleteId != null && plan.coachId === plan.athleteId;
  }

  // Insère des semaines consécutives à partir de `firstWeekNumber` (athleteId dénormalisé
  // explicitement : l'extension n'injecte que le champ tenant de l'acteur, ici coachId).
  private async createWeeks(
    tx: TenantTx | TenantPrisma,
    planId: string,
    athleteId: string | null,
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
