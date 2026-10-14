import type {
  CreatePlanInput,
  PlanDto,
  PlanSummaryDto,
  PlanWeekInput,
  PublishPlanInput,
  UpdatePlanInput,
  UpdatePlanWeekInput,
  VersionQuery,
} from "@cmv/shared";
import {
  CoachAthleteStatus,
  DAYS_PER_WEEK,
  daysBetweenIsoDates,
  PLAN_MAX_WEEKS,
  PlanStatus,
  required,
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
import {
  ACCESS_INCLUDE,
  type AccessContext,
  type AccessRow,
  toAccessView,
} from "../../access/access.mapper";
import { type AccessGesture, AccessService } from "../../access/service/access.service";
import { InvoiceService } from "../../invoice/service/invoice.service";
import { NotificationService } from "../../notification/notification.service";
import { ReminderService } from "../../reminder/service/reminder.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor } from "../../tenancy/tenant-context.type";
import { shiftDbDate, toDbDate, toIsoDate } from "../../util/date.util";
import {
  assertReadAtVersion,
  deleteAtVersion,
  staleOnCollision,
  writeAtVersion,
} from "../../util/stale-write.util";
import {
  COACH_PLAN_COUNTS_INCLUDE,
  COACH_PLAN_DETAIL_INCLUDE,
  type PlanAccess,
  toPlanDto,
  toPlanSummaryDto,
} from "../plan.mapper";
import { touchWeeks, WEEK_NOT_FOUND } from "../plan-week.version";

export type ListPlansFilters = { athleteId?: string };

/** Un cycle lu avec de quoi dire qui le possède, et ce que l'acteur peut en faire (#607). */
export type PlanWithAccess = Prisma.PlanGetPayload<{ include: typeof ACCESS_INCLUDE }>;

const PLAN_NOT_FOUND = "Planification introuvable";

@Injectable()
export class PlanService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly notifications: NotificationService,
    private readonly invoices: InvoiceService,
    private readonly reminders: ReminderService,
    private readonly cls: ClsService,
    private readonly access: AccessService,
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

  /**
   * Ses cycles, et ceux qu'on lui ouvre (#607) : un athlète suivi à plusieurs montre aussi ce que
   * l'autre Coach lui a écrit, avec son auteur (`coachName`) et le droit qu'on en a.
   */
  async list(filters: ListPlansFilters): Promise<PlanSummaryDto[]> {
    const where: Prisma.PlanWhereInput = {};
    if (filters.athleteId) where.athleteId = filters.athleteId;

    const [plans, context] = await Promise.all([
      this.db.plan.findMany({
        where,
        include: COACH_PLAN_COUNTS_INCLUDE,
        orderBy: { startDate: "desc" },
      }),
      this.access.context(),
    ]);
    return plans.map((plan) => toPlanSummaryDto(plan, planAccessOf(plan, context)));
  }

  async get(id: string): Promise<PlanDto> {
    return this.getDto(id);
  }

  /**
   * Déplacer la date de début décale le cycle ENTIER : les séances suivent leur semaine, sinon
   * elles sortiraient de la plage de celle-ci (invariant « une séance tombe dans sa semaine »).
   *
   * Tant que le cycle est un BROUILLON. Une fois diffusé, plus rien de ce qui le définit ne se
   * réécrit : ni son en-tête (`assertHeaderWritable`), ni son destinataire (`assertReassignable`).
   *
   * Sous la version lue (#604) : deux Coachs d'une même entreprise peuvent retoucher le même cycle,
   * et le second enregistrement n'efface plus le premier en silence — 409 `STALE_WRITE`.
   *
   * Changer de destinataire reste au propriétaire (#607) : c'est changer l'audience du cycle, les
   * Coachs qui peuvent le lire. Renvoyer le MÊME athlète n'en change rien, et passe en Écriture.
   */
  async update(id: string, input: UpdatePlanInput): Promise<PlanDto> {
    const { plan, context } = await this.getForOrThrow(id, "write");
    const reassigned = input.athleteId !== undefined;
    if (reassigned && (input.athleteId ?? null) !== plan.athleteId) {
      this.access.assertCan(toAccessView(plan, context), "reassign");
    }
    const expected = new Date(input.expectedUpdatedAt);
    // Le premier refus : une saisie périmée n'a pas vu l'état qu'on jugerait ensuite — un cycle
    // diffusé entre-temps, un destinataire déjà changé. « Recharger » le lui montrera.
    assertReadAtVersion(plan.updatedAt, expected);
    // Avant toute lecture supplémentaire : le refus est certain, inutile d'aller interroger la
    // base pour le destinataire.
    assertHeaderWritable(plan, input);

    // Forme UNCHECKED : `athleteId` s'écrit en scalaire, comme partout ailleurs sur cette chaîne
    // dénormalisée. La forme relationnelle demanderait un `connect`/`disconnect` là où le reste
    // du module raisonne en identifiants.
    const data: Prisma.PlanUncheckedUpdateManyInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;

    let shiftDays = 0;
    if (input.startDate !== undefined) {
      // Deux dates lisibles : celle de la base, et celle que le schéma vient de valider.
      shiftDays = required(
        daysBetweenIsoDates(toIsoDate(plan.startDate), input.startDate),
        `[plan] date de début illisible pour le plan ${id}`,
      );
      data.startDate = toDbDate(input.startDate);
    }

    // `undefined` = ne touche pas au destinataire ; `null` = le détacher. Les deux se
    // distinguent, et c'est toute la raison d'être du `nullable().optional()` du schéma.
    if (reassigned) {
      await this.assertReassignable(plan, input.athleteId ?? null);
      data.athleteId = input.athleteId ?? null;
    }

    // Rien à écrire : la version n'avance pas. L'avancer sans changement ferait prendre un 409 à
    // l'autre Coach pour une écriture qui n'a rien modifié.
    if (Object.keys(data).length === 0) return this.getDto(id, this.db, context);

    return this.db.$transaction(async (tx) => {
      await writeAtVersion(tx.plan, id, expected, data, PLAN_NOT_FOUND);
      if (shiftDays !== 0) {
        // Toutes les dates de la grille bougent : un geste fondé sur l'ancienne est périmé. Les
        // semaines d'abord, puis leurs séances — l'ordre des verrous de `touchWeeks`.
        await touchWeeks(tx, { planId: id });
        await this.shiftSessions(tx, { planId: id }, shiftDays);
      }
      if (reassigned) {
        await this.propagateAthlete(tx, id, input.athleteId ?? null);
      }
      // Relu DANS la transaction : la ligne reste verrouillée par notre écriture, la réponse porte
      // donc NOTRE version. Relue après, elle pourrait déjà porter celle d'un autre Coach — et le
      // formulaire, qui garde une saisie faite pendant l'envoi, la citerait par-dessus lui.
      return this.getDto(id, tx, context);
    });
  }

  /**
   * Ce qu'un changement de destinataire exige AVANT d'être écrit.
   *
   * Un cycle diffusé n'en change plus : son athlète a été notifié, s'entraîne dessus, et sa
   * facture est émise à son nom. Le refus est un 409 et non un 400 — ce n'est pas la demande qui
   * est mal formée, c'est l'état du cycle qui ne s'y prête plus.
   *
   * Même logique pour un brouillon dont la facture porte un justificatif (#472) : le PDF nomme
   * son destinataire. Renvoyer le MÊME athlète, en revanche, ne change rien et passe.
   */
  private async assertReassignable(plan: Plan, athleteId: string | null): Promise<void> {
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new ConflictException(
        "Le destinataire d'un cycle diffusé ne change plus : il en a déjà été prévenu",
      );
    }
    if (athleteId != null) {
      await this.assertAthleteOwned(athleteId);
      if (athleteId !== plan.athleteId) {
        await this.invoices.assertDocumentDetached(plan.id);
      }
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
    // `@updatedAt` fait avancer chaque semaine, et c'est voulu (#604) : un collage ou un glisser
    // pensé pour l'athlète d'avant n'a pas à passer en silence chez le suivant.
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

  /**
   * Un cycle DIFFUSÉ ne se supprime pas (#85) : la cascade emporterait sa facture émise, que
   * l'athlète a déjà vue, et les débriefs de ses séances — médias laissés orphelins dans le bucket.
   * Un brouillon, lui, n'a jamais été visible de l'athlète : aucune séance n'y est débriefée.
   *
   * Sous la version affichée (#604) : un cycle qu'un autre Coach a retouché, réaffecté ou DIFFUSÉ
   * depuis ne part pas sur la foi d'un écran périmé. La suppression conditionnelle tient aussi la
   * diffusion qui passerait entre le contrôle du statut et elle — sans quoi la cascade emporterait
   * un cycle tout juste diffusé, et sa facture émise. Cette version est celle de l'EN-TÊTE : les
   * semaines qu'un autre Coach vient d'y poser partent avec le cycle, que la suppression vise en
   * entier, après confirmation.
   */
  async delete(id: string, query: VersionQuery): Promise<void> {
    const { plan } = await this.getForOrThrow(id, "delete");
    const expected = new Date(query.expectedUpdatedAt);
    // La version avant le verrou, comme pour l'en-tête : un écran qui n'a pas vu la diffusion se
    // relit et la montre, au lieu d'opposer un refus à un état que le Coach ignore.
    assertReadAtVersion(plan.updatedAt, expected);
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new ConflictException(
        "Un cycle diffusé ne se supprime plus : sa facture est émise et son athlète s'entraîne dessus",
      );
    }
    // Semaines, séances, exercices et copies de documents partent en cascade (schéma). Les objets
    // S3 ne sont PAS touchés : ils appartiennent à la bibliothèque, les copies les partagent.
    //
    // Les RAPPELS, eux, n'ont pas de clé étrangère vers leur cible (référence polymorphe) : rien en
    // base ne les emporte. On les purge donc explicitement, dans la MÊME transaction — sinon un
    // rappel « relancer ce cycle » survivrait au cycle et ne mènerait plus nulle part (#44).
    //
    // La purge AVANT la suppression : elle retrouve la facture du cycle, que la cascade emporte.
    // Refusée, la suppression l'annule avec elle.
    await this.db.$transaction(async (tx) => {
      await this.reminders.purgeForPlan(tx, id);
      await deleteAtVersion(tx.plan, id, expected, PLAN_NOT_FOUND);
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
   *
   * Sous la version affichée (#604) : le destinataire, le titre et le début sont ceux que le Coach
   * a vus en diffusant. Réaffecté entre-temps par un autre Coach, le cycle partirait sinon chez un
   * athlète qu'il n'a jamais vu à l'écran — notifié, et facturé à son nom.
   */
  async publish(id: string, input: PublishPlanInput): Promise<PlanDto> {
    const { plan, context } = await this.getForOrThrow(id, "write");
    const expected = new Date(input.expectedUpdatedAt);
    // Avant tout autre refus : sur un écran périmé, le cycle est peut-être déjà diffusé, ou son
    // destinataire choisi — « relire » le montrera, « choisis l'athlète » le ferait chercher.
    assertReadAtVersion(plan.updatedAt, expected);
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

    const { invoice, published } = await this.db.$transaction(async (tx) => {
      // Conditionnée, et non lue puis écrite : la réaffectation qui passerait entre la lecture et
      // ici laisserait `plan` — donc la facture et les notifications — sur l'ancien athlète.
      await writeAtVersion(
        tx.plan,
        id,
        expected,
        { status: PlanStatus.PUBLISHED, publishedAt: new Date() },
        PLAN_NOT_FOUND,
      );
      // Gating : lève si aucune facturation n'a été saisie → la transaction est annulée.
      const issued = solo ? null : await this.invoices.issueForPlan(tx, plan);
      // Relu DANS la transaction, comme l'en-tête : la réponse porte NOTRE version.
      return { invoice: issued, published: await this.getDto(id, tx, context) };
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

    return published;
  }

  // ── Semaines ───────────────────────────────────────────────────────────────

  async addWeek(planId: string, input: PlanWeekInput): Promise<PlanDto> {
    const { plan, context } = await this.getForOrThrow(planId, "write");

    const weekCount = await this.db.planWeek.count({ where: { planId } });
    if (weekCount >= PLAN_MAX_WEEKS) {
      throw new BadRequestException(`Un cycle ne peut pas dépasser ${PLAN_MAX_WEEKS} semaines`);
    }

    // `plan.athleteId` peut être `null` (brouillon non encore affecté) : la semaine le recopie
    // tel quel, et l'affectation la rattrapera avec le reste du cycle.
    // Sans version (#604) : deux ajouts simultanés visent le même numéro, et le second, refusé
    // par l'unicité, reçoit le 409 d'une grille périmée plutôt qu'un 500.
    await staleOnCollision(() =>
      this.createWeeks(this.db, planId, plan.athleteId, [input], weekCount + 1),
    );
    return this.getDto(planId, this.db, context);
  }

  /** Sous la version de la semaine affichée (#604) — voir `updatePlanWeekSchema`. */
  async updateWeek(weekId: string, input: UpdatePlanWeekInput): Promise<PlanDto> {
    const week = await this.getWeekOrThrow(weekId);
    const { context } = await this.getForOrThrow(week.planId, "write");
    const expected = new Date(input.expectedUpdatedAt);
    assertReadAtVersion(week.updatedAt, expected);

    const data: Prisma.PlanWeekUpdateManyMutationInput = {};
    if (input.type !== undefined) data.type = input.type;
    if (input.note !== undefined) data.note = input.note;
    // Rien à écrire : la version n'avance pas, comme sur l'en-tête du cycle.
    if (Object.keys(data).length === 0) return this.getDto(week.planId, this.db, context);

    return this.db.$transaction(async (tx) => {
      await writeAtVersion(tx.planWeek, weekId, expected, data, WEEK_NOT_FOUND);
      return this.getDto(week.planId, tx, context);
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
    const week = await this.getWeekOrThrow(weekId);
    const { plan, context } = await this.getForOrThrow(week.planId, "write");
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
        await this.shiftSessions(tx, { planWeekId: next.id }, -DAYS_PER_WEEK);
      }
    });

    return this.getDto(week.planId, this.db, context);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Un cycle que l'acteur peut LIRE — le sien, ou un cycle qu'on lui ouvre (#607) —, ou 404 :
   * illisible, il ne dit rien de son existence. Public : séances planifiées et copie de semaine
   * s'appuient dessus — un seul contrôle, un seul message.
   */
  async getReadableOrThrow(id: string): Promise<PlanWithAccess> {
    const plan = await this.db.plan.findFirst({ where: { id }, include: ACCESS_INCLUDE });
    if (plan == null) {
      throw new NotFoundException(PLAN_NOT_FOUND);
    }
    return plan;
  }

  /**
   * Le cycle, si le droit de l'acteur couvre le geste : 404 illisible, 403 lisible sans plus. À
   * appeler AVANT toute écriture dans le cycle ou ses enfants : l'extension refuserait sinon
   * l'écriture d'un lecteur par un 500 (enfant créé) ou par une écriture qui ne touche rien.
   */
  async getForOrThrow(
    id: string,
    gesture: AccessGesture,
  ): Promise<{ plan: PlanWithAccess; context: AccessContext }> {
    const { row, context } = await this.access.loadFor(this.getReadableOrThrow(id), gesture);
    return { plan: row, context };
  }

  async getWeekOrThrow(weekId: string): Promise<PlanWeek> {
    const week = await this.db.planWeek.findFirst({ where: { id: weekId } });
    if (week == null) {
      throw new NotFoundException(WEEK_NOT_FOUND);
    }
    return week;
  }

  // Le plan complet (semaines + séances) — la forme rendue par l'API après chaque écriture.
  private async getDetailOrThrow(
    id: string,
    db: TenantPrisma | TenantTx,
  ): Promise<Prisma.PlanGetPayload<{ include: typeof COACH_PLAN_DETAIL_INCLUDE }>> {
    const plan = await db.plan.findFirst({ where: { id }, include: COACH_PLAN_DETAIL_INCLUDE });
    if (plan == null) {
      throw new NotFoundException(PLAN_NOT_FOUND);
    }
    return plan;
  }

  /**
   * `context` : celui que le geste a déjà lu. Dans une transaction, il est OBLIGATOIRE de fait —
   * le relire passerait par une autre connexion pendant que la transaction tient la sienne.
   */
  private async getDto(
    id: string,
    db: TenantPrisma | TenantTx = this.db,
    context?: AccessContext,
  ): Promise<PlanDto> {
    const [plan, actor] = await Promise.all([
      this.getDetailOrThrow(id, db),
      context ?? this.access.context(),
    ]);
    return toPlanDto(plan, planAccessOf(plan, actor));
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
  // explicitement : l'extension n'injecte que le propriétaire, coachId, repris du plan — #603).
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

/**
 * Ce qui DÉFINIT un cycle — son titre, sa description, son début — ne se réécrit plus une fois
 * diffusé, exactement comme son destinataire. Le refus est un 409 et non un 400 : la demande
 * n'est pas mal formée, c'est l'état du cycle qui ne s'y prête plus.
 *
 * Le message diffère de celui du destinataire parce qu'il dit autre chose : là où l'athlète « en
 * a déjà été prévenu », ici il s'entraîne dessus — et un cycle qui bouge sous ses pieds est pire
 * qu'un cycle qu'on ne peut plus corriger.
 *
 * La CAPACITÉ de décalage (`shiftSessions`) reste entière : elle sert au brouillon. Décaler un
 * cycle DIFFUSÉ (athlète blessé, report d'une semaine) est un besoin réel, mais demande un autre
 * dispositif — l'athlète doit en être prévenu (#172). C'est cette porte-ci qui se ferme, pas la
 * mécanique derrière.
 */
function assertHeaderWritable(plan: Plan, input: UpdatePlanInput): void {
  if (plan.status !== PlanStatus.PUBLISHED) return;
  const rewritesHeader =
    input.title !== undefined || input.description !== undefined || input.startDate !== undefined;
  if (!rewritesHeader) return;
  throw new ConflictException(
    "L'en-tête d'un cycle diffusé ne se réécrit plus : son athlète s'entraîne dessus",
  );
}

/** Le droit du Coach courant sur un cycle lu, et ses droits accordés pour le propriétaire seul. */
function planAccessOf(plan: AccessRow, context: AccessContext): PlanAccess {
  const { myAccess, grants } = toAccessView(plan, context);
  return { myAccess, grants };
}
