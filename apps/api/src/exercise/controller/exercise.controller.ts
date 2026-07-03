import { exerciseCategorySchema, Role } from "@cmv/shared";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { CreateExerciseDto } from "../dto/create-exercise.dto";
import { UpdateExerciseDto } from "../dto/update-exercise.dto";
import type { ListExercisesFilters } from "../service/exercise.service";
import { ExerciseService } from "../service/exercise.service";

@ApiTags("exercises")
@Roles([Role.COACH])
@Controller("exercises")
export class ExerciseController {
  constructor(private readonly exercises: ExerciseService) {}

  @Post()
  create(@Body() dto: CreateExerciseDto) {
    return this.exercises.create(dto);
  }

  @Get()
  list(@Query("category") category?: string, @Query("search") search?: string) {
    const filters: ListExercisesFilters = {};
    const parsed = category ? exerciseCategorySchema.safeParse(category) : null;
    if (parsed?.success) filters.category = parsed.data;
    const trimmed = search?.trim();
    if (trimmed) filters.search = trimmed;
    return this.exercises.list(filters);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.exercises.get(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateExerciseDto) {
    return this.exercises.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  delete(@Param("id") id: string) {
    return this.exercises.delete(id);
  }
}
