import type {
  CreateScheduledSessionInput,
  CustomMetric,
  PlanDto,
  ReorderPlanDayInput,
  ScheduledSessionDto,
  ScheduledSessionExerciseInput,
  UpdateScheduledSessionInput,
} from "@cmv/shared";
import {
  customMetricIdsIn,
  isDateInPlanWeek,
  PlanStatus,
  required,
  ScheduledSessionStatus,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
import { parseAdjustments, parseBlocks, parseInstructions } from "../../util/exercise-json.util";
import { assertInstructionImagesOwned } from "../../util/instruction-images.util";
import { athleteRecipientOrThrow } from "../plan.recipient";
import {
  type ScheduledSessionWithExercises,
  SESSION_DETAIL_INCLUDE,
  toScheduledSessionDto,
} from "../scheduled-session.mapper";
import { compactDay, type PositionedSession, writeDay } from "../scheduled-session.position";
import { type ExerciseRows, planExerciseRows } from "../scheduled-session.rows";
import {
  insertScheduledSessionExercises,
  rewriteScheduledSessionExercises,
} from "../scheduled-session.writer";
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
    // Seule une composition ENVOYÉE se contrôle : celle d'un modèle est écrite par le serveur,
    // depuis une bibliothèque dont les consignes sont contrôlées à l'écriture.
    for (const exercise of input.exercises ?? []) {
      assertInstructionImagesOwned(exercise.instructions, libraryDocumentsOf(exercise, documents));
    }

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
   *
   * La composition reçue REMPLACE celle de la séance, dans l'ordre du tableau — mais ses lignes
   * gardent leur identité (#296, #311) : une ligne citée par son `id` est mise à jour en place,
   * avec son suivi et ses documents. Seules les lignes nouvelles naissent, et seules celles que le
   * tableau ne cite plus partent.
   */
  async update(id: string, input: UpdateScheduledSessionInput): Promise<ScheduledSessionDto> {
    const session = await this.getOwnedOrThrow(id);
    const week = await this.plans.getWeekOwnedOrThrow(session.planWeekId);
    const plan = await this.plans.getOwnedOrThrow(session.planId);
    this.assertDateInWeek(plan, week, input.scheduledDate);

    const dateChanged = toIsoDate(session.scheduledDate) !== input.scheduledDate;
    // Le client n'a pas les DÉFINITIONS maison d'un exercice piocché dans la bibliothèque : sans
    // elles, l'athlète ne verrait qu'un identifiant de colonne. Le serveur les résout, comme à la
    // diffusion. Une définition déjà envoyée n'est pas retouchée : elle est figée depuis P3.
    const coachMetrics = await this.db.customMetric.findMany();
    const rows = planExerciseRows(
      session.exercises,
      input.exercises.map((exercise) => resolveCustomMetrics(exercise, coachMetrics)),
    );
    // La bibliothèque ne sert qu'aux exercices AJOUTÉS : une ligne reprise garde ses documents, et
    // son `sourceExerciseId` peut ne plus rien désigner (exercice supprimé, `SetNull`).
    const documents = await this.loadSourceDocuments(rows.added.map((row) => row.item));
    assertRowImagesOwned(session.exercises, rows, documents);

    await this.db.$transaction(async (tx) => {
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

      await rewriteScheduledSessionExercises(tx, id, session.athleteId, rows, (exercise) =>
        libraryDocumentsOf(exercise, documents),
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
   * Le CONTENU d'une journée et son ordre (#148, élargi en #93) — replace-all : le tableau reçu
   * définit ce que la journée porte, et dans quel ordre.
   *
   * Il peut donc citer une séance posée un autre jour de la MÊME semaine : elle y est déplacée, au
   * rang exact où le tableau la place. C'est le pendant serveur du glisser d'une case à l'autre, et
   * ça reste le même geste que le sélecteur « Jour » du panneau de séance — d'où la même annonce
   * (`PLAN_UPDATED`), et non celle du réordonnancement.
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
    const week = await this.plans.getWeekOwnedOrThrow(planWeekId);
    const plan = await this.plans.getOwnedOrThrow(week.planId);
    this.assertDateInWeek(plan, week, isoDate);

    // Toute la SEMAINE, et non la seule journée : le tableau peut citer une séance d'un autre jour.
    // Scopé au coach courant par l'extension tenant — une séance d'un autre coach n'y figure pas,
    // et les contrôles ci-dessous la refusent donc comme une séance étrangère à la semaine.
    const weekSessions = await this.db.scheduledSession.findMany({
      where: { planWeekId },
      select: { id: true, position: true, scheduledDate: true, title: true },
      orderBy: { position: "asc" },
    });

    const date = toDbDate(isoDate);
    const ordered = assertDayContent(weekSessions, input.sessionIds, date);

    const moved = ordered.filter((session) => session.scheduledDate.getTime() !== date.getTime());
    // Comparer l'état RÉSULTANT, jamais le fait qu'une requête soit passée : le `PUT` est
    // idempotent, et renvoyer l'ordre déjà en place ne dérange pas l'athlète (même règle que le
    // `readAt` de #105).
    const reordered = ordered.some((session, index) => session.position !== index);

    if (moved.length > 0 || reordered) {
      // Les jours d'origine, avant écriture : après, les séances n'y sont plus et on ne saurait
      // plus lesquels recoller.
      const sources = [...new Set(moved.map((session) => session.scheduledDate.getTime()))];

      await this.db.$transaction(async (tx) => {
        await writeDay(tx, ordered, date);
        for (const source of sources) {
          await compactDay(tx, planWeekId, new Date(source));
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

  async delete(id: string): Promise<void> {
    const session = await this.getOwnedOrThrow(id);
    const plan = await this.plans.getOwnedOrThrow(session.planId);

    await this.db.$transaction(async (tx) => {
      /**
       * Une séance débriefée ne se supprime pas (#313) : la cascade emporterait le débrief de
       * l'athlète, son suivi d'exécution et le lien des messages qui y répondent — et laisserait
       * ses médias orphelins dans le bucket. Le coach garde l'édition, qui préserve tout ça.
       *
       * La garde est DANS la suppression, pas dans une lecture préalable : un débrief créé au même
       * instant passe la séance en DONE dans sa transaction, et Postgres revérifie la condition sur
       * la ligne mise à jour avant de la supprimer. `DONE` n'est posé que par le débrief, qui ne
       * se supprime jamais : le statut dit exactement « un débrief existe ».
       *
       * Exercices et copies de documents partent en cascade. Aucun objet storage supprimé : les
       * copies ne font que partager les clés de la bibliothèque, qui en reste propriétaire.
       */
      const { count } = await tx.scheduledSession.deleteMany({
        where: { id, status: { not: ScheduledSessionStatus.DONE } },
      });
      if (count === 0) {
        throw new ConflictException(
          "Cette séance a été débriefée par l'athlète : elle ne peut plus être supprimée, mais reste modifiable",
        );
      }
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
  private nextPosition(tx: TenantTx, planWeekId: string, date: string): Promise<number> {
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
      return {
        // Garanti par le schéma (refine) : titre requis sans modèle source.
        title: required(input.title, "[plan] séance ad hoc sans titre malgré le schéma"),
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
      const exercise = required(
        library.get(composed.exerciseId),
        `[plan] exercice ${composed.exerciseId} hors scope du coach courant`,
      );
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
  ): Promise<void> {
    const drafts = exercises.map((exercise) => ({
      exercise,
      documents: libraryDocumentsOf(exercise, documentsBySource),
    }));
    return insertScheduledSessionExercises(tx, scheduledSessionId, athleteId, drafts);
  }
}

/**
 * Une consigne ne cite que les images de SA ligne (#315) : une ligne reprise, les documents qu'elle
 * porte déjà (#296) ; une ligne qui naît, ceux de l'exercice source, que l'écriture recopie puis
 * réaligne. Toute autre référence ne désignerait rien chez l'athlète.
 */
function assertRowImagesOwned(
  existing: ScheduledSessionWithExercises["exercises"],
  rows: ExerciseRows<ScheduledSessionExerciseInput>,
  documentsBySource: DocumentsBySource,
): void {
  const documentsOfRow = new Map(existing.map((row) => [row.id, row.documents]));
  for (const row of rows.kept) {
    assertInstructionImagesOwned(row.item.instructions, documentsOfRow.get(row.id) ?? []);
  }
  for (const row of rows.added) {
    assertInstructionImagesOwned(
      row.item.instructions,
      libraryDocumentsOf(row.item, documentsBySource),
    );
  }
}

/** Les documents de bibliothèque à recopier sur un exercice qui naît dans la séance. */
function libraryDocumentsOf(
  exercise: ScheduledSessionExerciseInput,
  documentsBySource: DocumentsBySource,
): ExerciseDocument[] {
  if (exercise.sourceExerciseId == null) return [];
  return documentsBySource.get(exercise.sourceExerciseId) ?? [];
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
 * Vérifie que `sessionIds` décrit une journée VALIDE, et rend ses séances dans l'ordre demandé.
 *
 * Deux règles, et une seule liberté :
 *  - tout identifiant cité appartient à la SEMAINE. Un identifiant étranger désigne soit une autre
 *    semaine, soit un autre coach — que le scope tenant a déjà rendu invisible. 400 dans les deux
 *    cas : la demande est mal formée ;
 *  - aucune séance déjà posée ce jour-là n'est OMISE. L'omettre ne dirait pas où elle va : elle
 *    garderait son rang d'avant, donc des doublons et des trous sur
 *    `@@unique([planWeekId, scheduledDate, position])`. Vider une journée se fait en déplaçant ou
 *    en supprimant ses séances, pas en les taisant ;
 *  - en revanche une séance d'un AUTRE jour de la semaine peut être citée : elle est déplacée ici,
 *    au rang où le tableau la place. C'est tout l'objet de l'élargissement (#93).
 */
function assertDayContent<T extends PositionedSession>(
  weekSessions: readonly T[],
  sessionIds: readonly string[],
  date: Date,
): T[] {
  const byId = new Map(weekSessions.map((session) => [session.id, session]));
  const wanted = new Set(sessionIds);

  if (wanted.size !== sessionIds.length) {
    throw new BadRequestException("Une séance est citée deux fois dans l'ordre demandé");
  }

  const missing = weekSessions.filter(
    (session) => session.scheduledDate.getTime() === date.getTime() && !wanted.has(session.id),
  );
  if (missing.length > 0) {
    throw new BadRequestException(
      "L'ordre doit citer TOUTES les séances déjà posées ce jour-là, sans en omettre",
    );
  }

  return sessionIds.map((id) => {
    const session = byId.get(id);
    if (session == null) {
      throw new BadRequestException(`La séance ${id} n'appartient pas à cette semaine`);
    }
    return session;
  });
}
