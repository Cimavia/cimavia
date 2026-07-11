import type {
  CreateExerciseInput,
  ExerciseCategory,
  ExerciseDto,
  UpdateExerciseInput,
} from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toExerciseDocumentDto } from "../exercise-document.mapper";

export type ListExercisesFilters = {
  category?: ExerciseCategory;
  search?: string;
};

// L'exercice avec ses documents (URLs signées à mapper).
type ExerciseWithDocuments = Prisma.ExerciseGetPayload<{ include: { documents: true } }>;

@Injectable()
export class ExerciseService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
  ) {}

  private async toDto(exercise: ExerciseWithDocuments): Promise<ExerciseDto> {
    // Documents ordonnés par ancienneté ; chaque FILE reçoit une URL GET signée.
    const documents = await Promise.all(
      exercise.documents
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((doc) => toExerciseDocumentDto(doc, this.storage)),
    );
    return {
      id: exercise.id,
      coachId: exercise.coachId,
      title: exercise.title,
      description: exercise.description,
      category: exercise.category,
      documents,
      createdAt: exercise.createdAt.toISOString(),
      updatedAt: exercise.updatedAt.toISOString(),
    };
  }

  // Charge un exercice du coach courant, ou lève 404 (scope coachId appliqué par le tenancy layer).
  private async getOwnedOrThrow(id: string): Promise<ExerciseWithDocuments> {
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
    await this.getOwnedOrThrow(id);
    await this.db.exercise.delete({ where: { id } });
  }
}
