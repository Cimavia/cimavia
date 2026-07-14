import type {
  CreateExerciseInput,
  ExerciseCategory,
  ExerciseDto,
  UpdateExerciseInput,
} from "@cmv/shared";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { type ExerciseWithDocuments, toExerciseDto } from "../exercise.mapper";
import { DocumentCleanupService } from "./document-cleanup.service";

export type ListExercisesFilters = {
  category?: ExerciseCategory;
  search?: string;
};

@Injectable()
export class ExerciseService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
    private readonly cleanup: DocumentCleanupService,
  ) {}

  private toDto(exercise: ExerciseWithDocuments): Promise<ExerciseDto> {
    return toExerciseDto(exercise, this.storage);
  }

  /**
   * Charge un exercice du coach courant, ou lève 404 (scope coachId appliqué par le tenancy layer).
   * Public : `ExerciseDocumentService` s'appuie dessus — un seul contrôle d'appartenance,
   * un seul message, pas deux implémentations à garder en phase.
   */
  async getOwnedOrThrow(id: string): Promise<ExerciseWithDocuments> {
    const exercise = await this.db.exercise.findFirst({
      where: { id },
      include: { documents: true },
    });
    if (exercise == null) {
      throw new NotFoundException("Exercice introuvable");
    }
    return exercise;
  }

  async create(input: CreateExerciseInput): Promise<ExerciseDto> {
    const exercise = await this.db.exercise.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        category: input.category,
      } satisfies Omit<
        Prisma.ExerciseUncheckedCreateInput,
        "coachId"
      > as Prisma.ExerciseUncheckedCreateInput,
      include: { documents: true },
    });
    return this.toDto(exercise);
  }

  async list(filters: ListExercisesFilters): Promise<ExerciseDto[]> {
    const where: Prisma.ExerciseWhereInput = {};
    if (filters.category) where.category = filters.category;
    if (filters.search) where.title = { contains: filters.search, mode: "insensitive" };

    const exercises = await this.db.exercise.findMany({
      where,
      include: { documents: true },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(exercises.map((exercise) => this.toDto(exercise)));
  }

  async get(id: string): Promise<ExerciseDto> {
    return this.toDto(await this.getOwnedOrThrow(id));
  }

  async update(id: string, input: UpdateExerciseInput): Promise<ExerciseDto> {
    await this.getOwnedOrThrow(id);
    const data: Prisma.ExerciseUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;

    const exercise = await this.db.exercise.update({
      where: { id },
      data,
      include: { documents: true },
    });
    return this.toDto(exercise);
  }

  async delete(id: string): Promise<void> {
    const exercise = await this.getOwnedOrThrow(id);

    // SessionExercise.exercise est en onDelete: Restrict — la bibliothèque ne doit pas se vider
    // sous les séances qui s'en servent. On renvoie un 409 explicite plutôt que de laisser
    // remonter une violation de clé étrangère (500), et le client peut afficher le pourquoi.
    const usedInSessions = await this.db.sessionExercise.count({ where: { exerciseId: id } });
    if (usedInSessions > 0) {
      throw new ConflictException(
        `Exercice utilisé dans ${usedInSessions} séance(s) : retirez-le d'abord de ces séances`,
      );
    }

    // Les lignes ExerciseDocument partent en cascade, mais PAS les objets en storage : on les
    // supprime explicitement, sinon ils resteraient orphelins (et facturés). Sauf ceux qu'une
    // séance planifiée affiche encore — ses copies partagent la clé objet (P3).
    for (const document of exercise.documents) {
      await this.cleanup.deleteObjectIfUnreferenced(document);
    }

    await this.db.exercise.delete({ where: { id } });
  }
}
