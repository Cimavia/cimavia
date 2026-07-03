import type {
  CreateExerciseInput,
  ExerciseCategory,
  ExerciseDto,
  UpdateExerciseInput,
} from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Exercise, Prisma } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";

export type ListExercisesFilters = {
  category?: ExerciseCategory;
  search?: string;
};

function toDto(exercise: Exercise): ExerciseDto {
  return {
    id: exercise.id,
    coachId: exercise.coachId,
    title: exercise.title,
    description: exercise.description,
    category: exercise.category,
    documents: [],
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}

@Injectable()
export class ExerciseService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  // Charge un exercice du coach courant, ou lève 404 (scope coachId appliqué par le tenancy layer).
  private async getOwnedOrThrow(id: string): Promise<Exercise> {
    const exercise = await this.db.exercise.findFirst({ where: { id } });
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
    });
    return toDto(exercise);
  }

  async list(filters: ListExercisesFilters): Promise<ExerciseDto[]> {
    const where: Prisma.ExerciseWhereInput = {};
    if (filters.category) where.category = filters.category;
    if (filters.search) where.title = { contains: filters.search, mode: "insensitive" };

    const exercises = await this.db.exercise.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return exercises.map(toDto);
  }

  async get(id: string): Promise<ExerciseDto> {
    return toDto(await this.getOwnedOrThrow(id));
  }

  async update(id: string, input: UpdateExerciseInput): Promise<ExerciseDto> {
    await this.getOwnedOrThrow(id);
    const data: Prisma.ExerciseUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;

    const exercise = await this.db.exercise.update({ where: { id }, data });
    return toDto(exercise);
  }

  async delete(id: string): Promise<void> {
    await this.getOwnedOrThrow(id);
    await this.db.exercise.delete({ where: { id } });
  }
}
