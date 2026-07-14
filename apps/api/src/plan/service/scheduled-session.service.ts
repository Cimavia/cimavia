import type {
  CreateScheduledSessionInput,
  ScheduledSessionDto,
  ScheduledSessionExerciseInput,
  UpdateScheduledSessionInput,
} from "@cmv/shared";
import { isDateInPlanWeek } from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Exercise, ExerciseDocument, Plan, PlanWeek, Prisma } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toDbDate, toIsoDate } from "../../util/date.util";
import {
  type ScheduledSessionWithExercises,
  SESSION_DETAIL_INCLUDE,
  toScheduledSessionDto,
} from "../scheduled-session.mapper";
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

      await this.insertExercises(tx, id, session.athleteId, input.exercises, documents);
    });

    return this.getDto(id);
  }

  async delete(id: string): Promise<void> {
    await this.getOwnedOrThrow(id);
    // Exercices et copies de documents partent en cascade. Aucun objet storage supprimé : les
    // copies ne font que partager les clés de la bibliothèque, qui en reste propriétaire.
    await this.db.scheduledSession.delete({ where: { id } });
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

  // Position = rang dans la JOURNÉE (plusieurs séances possibles le même jour).
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
    const copied = template.exercises.map((composed) => {
      const exercise = library.get(composed.exerciseId);
      if (exercise == null) {
        throw new Error(`[plan] exercice ${composed.exerciseId} hors scope du coach courant`);
      }
      return {
        sourceExerciseId: exercise.id,
        title: exercise.title,
        description: exercise.description,
        category: exercise.category,
        prescription: composed.prescription,
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
  private async loadExercises(exerciseIds: string[]): Promise<Map<string, Exercise>> {
    const ids = [...new Set(exerciseIds)];
    if (ids.length === 0) return new Map();

    const exercises = await this.db.exercise.findMany({ where: { id: { in: ids } } });
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

  // Écrit la composition : un exercice par ligne (position = ordre du tableau), et les documents
  // de l'exercice source recopiés — mêmes clés objet, aucun binaire dupliqué.
  private async insertExercises(
    tx: TenantTx,
    scheduledSessionId: string,
    athleteId: string,
    exercises: ScheduledSessionExerciseInput[],
    documentsBySource: DocumentsBySource,
  ): Promise<void> {
    for (const [position, exercise] of exercises.entries()) {
      const created = await tx.scheduledSessionExercise.create({
        data: {
          athleteId,
          scheduledSessionId,
          sourceExerciseId: exercise.sourceExerciseId ?? null,
          title: exercise.title,
          description: exercise.description ?? null,
          category: exercise.category,
          prescription: exercise.prescription ?? null,
          position,
        } satisfies Omit<
          Prisma.ScheduledSessionExerciseUncheckedCreateInput,
          "coachId"
        > as Prisma.ScheduledSessionExerciseUncheckedCreateInput,
      });

      const documents =
        exercise.sourceExerciseId == null
          ? []
          : (documentsBySource.get(exercise.sourceExerciseId) ?? []);
      if (documents.length === 0) continue;

      await tx.scheduledSessionExerciseDocument.createMany({
        data: documents.map((document) => ({
          athleteId,
          scheduledSessionExerciseId: created.id,
          type: document.type,
          storagePath: document.storagePath,
          url: document.url,
          fileName: document.fileName,
          mimeType: document.mimeType,
        })) satisfies Omit<
          Prisma.ScheduledSessionExerciseDocumentUncheckedCreateInput,
          "coachId"
        >[] as Prisma.ScheduledSessionExerciseDocumentUncheckedCreateInput[],
      });
    }
  }
}
