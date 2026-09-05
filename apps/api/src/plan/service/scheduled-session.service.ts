import type {
  CreateScheduledSessionInput,
  CustomMetric,
  PlanDto,
  ReorderPlanDayInput,
  ScheduledSessionDto,
  ScheduledSessionExerciseInput,
  UpdateScheduledSessionInput,
} from "@cmv/shared";
import { customMetricIdsIn, isDateInPlanWeek, PlanStatus } from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CustomMetric as CustomMetricRow,
  ExerciseDocument,
  Plan,
  PlanWeek,
  Prisma,
} from "@prisma/client";

// L'exercice de bibliothèque AVEC ses tags : la copie diffusée les fige, comme les documents.
type ExerciseWithTags = Prisma.ExerciseGetPayload<{ include: { tags: true } }>;

import { toCustomMetricDto } from "../../custom-metric/custom-metric.mapper";
import { StorageService } from "../../infra/storage/storage.service";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toDbDate, toIsoDate } from "../../util/date.util";
import {
  parseAdjustments,
  parseBlocks,
  parseInstructions,
  parseTracking,
} from "../../util/exercise-json.util";
import { athleteRecipientOrThrow } from "../plan.recipient";
import {
  type ScheduledSessionWithExercises,
  SESSION_DETAIL_INCLUDE,
  toScheduledSessionDto,
} from "../scheduled-session.mapper";
import { compactDay, writePositions } from "../scheduled-session.position";
import { insertScheduledSessionExercises } from "../scheduled-session.writer";
import { PlanService } from "./plan.service";

// La séance telle qu'elle sera écrite : un instantané, plus aucune référence à résoudre.
type SessionDraft = {
  title: string;
  notes: string | null;
  exercises: ScheduledSessionExerciseInput[];
};

// Documents de la bibliothèque, par exercice source — à copier sur les exercices de l'instance.
type DocumentsBySource = Map<string, ExerciseDocument[]>;

/**
 * Séances planifiées = COPIES ÉDITABLES d'un modèle de séance (CDC §5.4). Modifier une instance
 * ne touche jamais la bibliothèque, et modifier la bibliothèque ne touche jamais une planif
 * diffusée : titre, description, catégorie, prescription et documents sont dupliqués ici.
 */
@Injectable()
export class ScheduledSessionService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
    // Contrôles d'appartenance du plan et de la semaine : source unique (PlanService).
    private readonly plans: PlanService,
    private readonly notifications: NotificationService,
  ) {}

  async create(
    planWeekId: string,
    input: CreateScheduledSessionInput,
  ): Promise<ScheduledSessionDto> {
    const week = await this.plans.getWeekOwnedOrThrow(planWeekId);
    const plan = await this.plans.getOwnedOrThrow(week.planId);
    this.assertDateInWeek(plan, week, input.scheduledDate);

    const draft = await this.buildDraft(input);
    const documents = await this.loadSourceDocuments(draft.exercises);

    const session = await this.db.$transaction(async (tx) => {
      const created = await tx.scheduledSession.create({
        // coachId injecté par le tenancy layer ; athleteId dénormalisé explicitement.
        data: {
          athleteId: plan.athleteId,
          planId: plan.id,
          planWeekId,
          sourceSessionId: input.sourceSessionId ?? null,
          title: draft.title,
          notes: draft.notes,
          scheduledDate: toDbDate(input.scheduledDate),
          position: await this.nextPosition(tx, planWeekId, input.scheduledDate),
        } satisfies Omit<
          Prisma.ScheduledSessionUncheckedCreateInput,
          "coachId"
        > as Prisma.ScheduledSessionUncheckedCreateInput,
      });
      await this.insertExercises(tx, created.id, plan.athleteId, draft.exercises, documents);
      return created;
    });

    // Ajouter une séance à un cycle DÉJÀ diffusé, c'est l'ajuster (CDC §5.7) : sans notification,
    // l'athlète ne saurait pas qu'une séance de plus l'attend — et son cache hors-ligne, lui,
    // continuerait d'afficher la semaine d'avant. Sur un brouillon, rien à annoncer.
    if (plan.status === PlanStatus.PUBLISHED) {
      await this.notifications.notifyPlanSessionAdded({
        athleteId: athleteRecipientOrThrow(plan),
        planId: plan.id,
        sessionTitle: draft.title,
      });
    }

    return this.getDto(session.id);
  }

  async get(id: string): Promise<ScheduledSessionDto> {
    return this.getDto(id);
  }

  /**
   * Édition d'une instance — y compris en cours de cycle diffusé (CDC §5.7, sans historique).
   * Replace-all : l'ordre du tableau définit les positions, comme pour la séance modèle.
   */
  async update(id: string, input: UpdateScheduledSessionInput): Promise<ScheduledSessionDto> {
    const session = await this.getOwnedOrThrow(id);
    const week = await this.plans.getWeekOwnedOrThrow(session.planWeekId);
    const plan = await this.plans.getOwnedOrThrow(session.planId);
    this.assertDateInWeek(plan, week, input.scheduledDate);

    const documents = await this.loadSourceDocuments(input.exercises);
    const dateChanged = toIsoDate(session.scheduledDate) !== input.scheduledDate;
    // Le client n'a pas les DÉFINITIONS maison d'un exercice piocché dans la bibliothèque : sans
    // elles, l'athlète ne verrait qu'un identifiant de colonne. Le serveur les résout, comme à la
    // diffusion. Une définition déjà envoyée n'est pas retouchée : elle est figée depuis P3.
    const coachMetrics = await this.db.customMetric.findMany();

    /**
     * Lu AVANT la suppression : le replace-all réécrit tout, et ce qui ne transite pas par le
     * client serait perdu. Le SUIVI d'exécution est dans ce cas — il appartient à l'athlète, et
     * une réécriture de la séance par le coach ne doit jamais l'effacer.
     */
    const previous = await this.db.scheduledSessionExercise.findMany({
      where: { scheduledSessionId: id },
      select: { id: true, tracking: true, baseline: true },
    });
    const carried = new Map(previous.map((row) => [row.id, row]));

    await this.db.$transaction(async (tx) => {
      // Les copies de documents partent en cascade avec leurs exercices (schéma) ; les objets en
      // storage, eux, appartiennent à la bibliothèque et ne sont jamais touchés d'ici.
      await tx.scheduledSessionExercise.deleteMany({ where: { scheduledSessionId: id } });

      await tx.scheduledSession.update({
        where: { id },
        data: {
          title: input.title,
          notes: input.notes ?? null,
          scheduledDate: toDbDate(input.scheduledDate),
          // Changer de jour = prendre la fin de file du nouveau jour ; sinon la position tient.
          position: dateChanged
            ? await this.nextPosition(tx, session.planWeekId, input.scheduledDate)
            : session.position,
        },
      });

      await this.insertExercises(
        tx,
        id,
        session.athleteId,
        input.exercises.map((exercise) => resolveCustomMetrics(exercise, coachMetrics)),
        documents,
        carried,
      );

      // Changer de jour, c'est aussi QUITTER un jour : sans ce recollage, l'ancien garde le trou.
      if (dateChanged) await compactDay(tx, session.planWeekId, session.scheduledDate);
    });

    // Ajuster un cycle DÉJÀ diffusé doit prévenir l'athlète (CDC §5.7) : il a peut-être la
    // version d'avant en cache hors-ligne, et s'entraînerait dessus. Sur un brouillon, il n'y a
    // rien à annoncer — le cycle n'existe pas encore pour lui.
    if (plan.status === PlanStatus.PUBLISHED) {
      await this.notifications.notifyPlanUpdated({
        athleteId: athleteRecipientOrThrow(plan),
        planId: plan.id,
        sessionTitle: input.title,
      });
    }

    return this.getDto(id);
  }

  /**
   * L'ordre des séances d'UNE journée (#148) — replace-all : le tableau reçu DÉFINIT les rangs.
   *
   * Réordonner reste autorisé sur un cycle DIFFUSÉ, contrairement au collage de semaine (#4) qui
   * s'y refuse : la différence n'est pas le statut, c'est le nombre d'écritures. Un collage émet
   * une notification par séance et rien ne les groupe (dette N-6) ; ici le geste est UN, donc son
   * annonce l'est aussi.
   */
  async reorderDay(
    planWeekId: string,
    isoDate: string,
    input: ReorderPlanDayInput,
  ): Promise<PlanDto> {
    const week = await this.plans.getWeekOwnedOrThrow(planWeekId);
    const plan = await this.plans.getOwnedOrThrow(week.planId);
    this.assertDateInWeek(plan, week, isoDate);

    // Scopé au coach courant par l'extension tenant : une séance d'un autre coach n'y figure pas,
    // et la vérification d'exhaustivité ci-dessous la refuse donc comme une séance étrangère.
    const sessions = await this.db.scheduledSession.findMany({
      where: { planWeekId, scheduledDate: toDbDate(isoDate) },
      select: { id: true, position: true },
      orderBy: { position: "asc" },
    });

    const ordered = assertSameSessions(sessions, input.sessionIds);
    // Comparer les rangs RÉSULTANTS, jamais le fait qu'une requête soit passée : le `PUT` est
    // idempotent, et renvoyer l'ordre déjà en place ne dérange pas l'athlète (même règle que le
    // `readAt` de #105).
    const changed = ordered.some((session, index) => session.position !== index);

    if (changed) {
      await this.db.$transaction((tx) => writePositions(tx, ordered));

      if (plan.status === PlanStatus.PUBLISHED) {
        await this.notifications.notifyPlanSessionsReordered({
          athleteId: athleteRecipientOrThrow(plan),
          planId: plan.id,
          isoDate,
        });
      }
    }

    return this.plans.get(plan.id);
  }

  async delete(id: string): Promise<void> {
    const session = await this.getOwnedOrThrow(id);
    const plan = await this.plans.getOwnedOrThrow(session.planId);

    await this.db.$transaction(async (tx) => {
      // Exercices et copies de documents partent en cascade. Aucun objet storage supprimé : les
      // copies ne font que partager les clés de la bibliothèque, qui en reste propriétaire.
      await tx.scheduledSession.delete({ where: { id } });
      // La journée se recolle DANS la même transaction : un trou laissé derrière ferait échouer
      // la prochaine séance ajoutée ce jour-là, sur une contrainte d'unicité que le coach n'a
      // aucun moyen de relier à la suppression qu'il vient de faire.
      await compactDay(tx, session.planWeekId, session.scheduledDate);
    });

    // Retirer une séance d'un cycle diffusé est l'ajustement le plus déroutant pour l'athlète :
    // sans notification, une séance disparaît de son planning sans explication — ou pire, reste
    // visible dans son cache hors-ligne et il se déplace pour rien.
    if (plan.status === PlanStatus.PUBLISHED) {
      await this.notifications.notifyPlanSessionRemoved({
        athleteId: athleteRecipientOrThrow(plan),
        planId: plan.id,
        sessionTitle: session.title,
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  async getOwnedOrThrow(id: string): Promise<ScheduledSessionWithExercises> {
    const session = await this.db.scheduledSession.findFirst({
      where: { id },
      include: SESSION_DETAIL_INCLUDE,
    });
    if (session == null) {
      throw new NotFoundException("Séance planifiée introuvable");
    }
    return session;
  }

  private async getDto(id: string): Promise<ScheduledSessionDto> {
    return toScheduledSessionDto(await this.getOwnedOrThrow(id), this.storage);
  }

  // Une séance ne peut pas être posée hors de la plage de sa semaine (sinon la vue calendrier
  // afficherait une séance de la semaine 2 dans la semaine 1).
  private assertDateInWeek(plan: Plan, week: PlanWeek, date: string): void {
    if (!isDateInPlanWeek(toIsoDate(plan.startDate), week.weekNumber, date)) {
      throw new BadRequestException(
        `La date ${date} ne tombe pas dans la semaine ${week.weekNumber} du cycle`,
      );
    }
  }

  /**
   * Position = rang dans la JOURNÉE (plusieurs séances possibles le même jour).
   *
   * Compter suffit parce que les rangs d'une journée sont CONTIGUS : c'est l'invariant que
   * `compactDay` tient à chaque départ de séance. Le jour où il tomberait, ce compte rendrait un
   * rang déjà occupé.
   */
  private async nextPosition(tx: TenantTx, planWeekId: string, date: string): Promise<number> {
    return tx.scheduledSession.count({
      where: { planWeekId, scheduledDate: toDbDate(date) },
    });
  }

  /**
   * Résout ce qui sera écrit : soit la copie d'un modèle de séance, soit une séance ad hoc.
   * Le client peut surcharger n'importe quelle partie de la copie (titre, consignes, composition)
   * dès la création — c'est déjà une instance, pas une référence.
   */
  private async buildDraft(input: CreateScheduledSessionInput): Promise<SessionDraft> {
    if (input.sourceSessionId == null) {
      if (input.title == null) {
        // Garanti par le schéma (refine) : titre requis sans modèle source.
        throw new BadRequestException("Titre requis pour une séance sans modèle source");
      }
      return {
        title: input.title,
        notes: input.notes ?? null,
        exercises: input.exercises ?? [],
      };
    }

    const template = await this.db.session.findFirst({
      where: { id: input.sourceSessionId },
      include: { exercises: { orderBy: { position: "asc" } } },
    });
    if (template == null) {
      throw new BadRequestException("Séance modèle inconnue");
    }

    // Les include imbriqués ne sont PAS scopés : les exercices de la bibliothèque se chargent
    // par une requête scopée séparée (architecture-choice §6, piège n°2).
    const library = await this.loadExercises(template.exercises.map((e) => e.exerciseId));
    // Chargées UNE fois pour toute la séance : chaque exercice n'en cite qu'une poignée, et une
    // requête par exercice serait du gaspillage.
    const coachMetrics = await this.db.customMetric.findMany();
    const copied = template.exercises.map((composed) => {
      const exercise = library.get(composed.exerciseId);
      if (exercise == null) {
        throw new Error(`[plan] exercice ${composed.exerciseId} hors scope du coach courant`);
      }
      return {
        sourceExerciseId: exercise.id,
        title: exercise.title,
        description: exercise.description,
        // La consigne vient de la BIBLIOTHÈQUE : elle n'est pas surchargeable au niveau séance,
        // donc la séance n'en garde aucune copie. Elle se fige ici, dans le snapshot de l'athlète.
        instructions: parseInstructions(exercise.instructions),
        // Le dosage vient de la SÉANCE, pas de l'exercice. Lire la bibliothèque ici diffuserait
        // les valeurs d'origine et ferait disparaître, sans le moindre avertissement, tout ce que
        // le coach a ajusté au niveau séance.
        blocks: parseBlocks(composed.blocks),
        adjustments: parseAdjustments(composed.adjustments),
        // Les définitions des métriques maison partent AVEC la copie : sans elles l'athlète ne
        // verrait qu'un identifiant, et renommer la métrique dégraderait une planif diffusée.
        customMetrics: customMetricsFor(parseBlocks(composed.blocks), coachMetrics),
        tags: exercise.tags.map((tag) => tag.name).sort(),
        note: composed.note,
      };
    });

    return {
      title: input.title ?? template.title,
      notes: input.notes !== undefined ? (input.notes ?? null) : template.notes,
      exercises: input.exercises ?? copied,
    };
  }

  // Charge (scopé) les exercices de la bibliothèque référencés, en vérifiant qu'ils existent TOUS
  // pour le coach courant : une FK ne garantit pas le tenant (architecture-choice §6, piège n°3).
  private async loadExercises(exerciseIds: string[]): Promise<Map<string, ExerciseWithTags>> {
    const ids = [...new Set(exerciseIds)];
    if (ids.length === 0) return new Map();

    const exercises = await this.db.exercise.findMany({
      where: { id: { in: ids } },
      include: { tags: true },
    });
    if (exercises.length !== ids.length) {
      throw new BadRequestException("Un ou plusieurs exercices sont inconnus");
    }
    return new Map(exercises.map((exercise) => [exercise.id, exercise]));
  }

  // Documents à copier, par exercice source. Valide au passage l'appartenance des sourceExerciseId
  // fournis par le client (ils peuvent venir d'un autre coach — la FK ne l'interdit pas).
  private async loadSourceDocuments(
    exercises: ScheduledSessionExerciseInput[],
  ): Promise<DocumentsBySource> {
    const sourceIds = exercises
      .map((exercise) => exercise.sourceExerciseId)
      .filter((id): id is string => id != null);
    await this.loadExercises(sourceIds);
    if (sourceIds.length === 0) return new Map();

    const documents = await this.db.exerciseDocument.findMany({
      where: { exerciseId: { in: [...new Set(sourceIds)] } },
      orderBy: { createdAt: "asc" },
    });

    const bySource: DocumentsBySource = new Map();
    for (const document of documents) {
      const existing = bySource.get(document.exerciseId) ?? [];
      existing.push(document);
      bySource.set(document.exerciseId, existing);
    }
    return bySource;
  }

  // Rattache à chaque exercice les documents de la BIBLIOTHÈQUE (via `sourceExerciseId`), puis
  // délègue l'écriture. La copie de semaine (#4) rattache, elle, les documents de l'instance
  // source — même écriture, source différente (cf. `scheduled-session.writer.ts`).
  private insertExercises(
    tx: TenantTx,
    scheduledSessionId: string,
    athleteId: string | null,
    exercises: ScheduledSessionExerciseInput[],
    documentsBySource: DocumentsBySource,
    carried: CarriedRows = new Map(),
  ): Promise<void> {
    const drafts = exercises.map((exercise) => {
      // `id` absent, ou inconnu de cette séance : c'est un exercice NOUVEAU. Rien à reprendre, et
      // surtout pas le suivi d'une ligne qu'on n'a pas écrite.
      const previous = exercise.id == null ? undefined : carried.get(exercise.id);
      return {
        exercise,
        ...(previous == null
          ? {}
          : {
              tracking: parseTracking(previous.tracking),
              baseline: parseBlocks(previous.baseline),
            }),
        documents:
          exercise.sourceExerciseId == null
            ? []
            : (documentsBySource.get(exercise.sourceExerciseId) ?? []),
      };
    });
    return insertScheduledSessionExercises(tx, scheduledSessionId, athleteId, drafts);
  }
}

/**
 * Les définitions citées par ces blocs, parmi celles du coach. Une citation orpheline est ignorée.
 *
 * Passe par le MAPPER et non par `customMetricSchema.parse` : le schéma est `.strict()`, et une
 * ligne Prisma porte `coachId`, `createdAt`, `updatedAt` qu'il refuse. Parser une ligne de base
 * comme si c'était un DTO faisait échouer toute la diffusion dès qu'un exercice citait une
 * métrique maison.
 */
function customMetricsFor(
  blocks: ReturnType<typeof parseBlocks>,
  coachMetrics: readonly CustomMetricRow[],
): CustomMetric[] {
  const wanted = new Set(customMetricIdsIn(blocks));
  return coachMetrics.filter((metric) => wanted.has(metric.id)).map(toCustomMetricDto);
}

/** Ce qu'une ligne précédente lègue à celle qui la remplace, indexé par son identifiant. */
type CarriedRows = Map<string, { tracking: Prisma.JsonValue; baseline: Prisma.JsonValue }>;

/** Complète les métriques maison quand le client ne les a pas — un exercice tout juste ajouté. */
function resolveCustomMetrics(
  exercise: ScheduledSessionExerciseInput,
  coachMetrics: readonly CustomMetricRow[],
): ScheduledSessionExerciseInput {
  if (exercise.customMetrics != null) return exercise;
  return {
    ...exercise,
    customMetrics: customMetricsFor(exercise.blocks ?? [], coachMetrics),
  };
}

/**
 * Vérifie que `sessionIds` est une PERMUTATION des séances de la journée, et rend celles-ci dans
 * l'ordre demandé.
 *
 * Un sous-ensemble est refusé, et ce n'est pas de la rigueur gratuite : les séances tues
 * garderaient leur rang d'avant, donc des doublons et des trous sur
 * `@@unique([planWeekId, scheduledDate, position])`. Un identifiant étranger l'est aussi — il
 * désigne soit une séance d'un autre jour, soit une séance d'un autre coach, que le scope tenant a
 * déjà rendue invisible. Les deux cas sont des 400 : la demande est mal formée, l'état ne s'y
 * prête pas moins.
 */
function assertSameSessions(
  sessions: readonly { id: string; position: number }[],
  sessionIds: readonly string[],
): { id: string; position: number }[] {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const wanted = new Set(sessionIds);

  if (wanted.size !== sessionIds.length) {
    throw new BadRequestException("Une séance est citée deux fois dans l'ordre demandé");
  }
  if (sessionIds.length !== sessions.length) {
    throw new BadRequestException(
      "L'ordre doit citer TOUTES les séances de la journée, et rien d'autre",
    );
  }

  return sessionIds.map((id) => {
    const session = byId.get(id);
    if (session == null) {
      throw new BadRequestException(`La séance ${id} n'est pas une séance de cette journée`);
    }
    return session;
  });
}
