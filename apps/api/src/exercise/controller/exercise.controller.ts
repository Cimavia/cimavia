import { exerciseTagSchema, Role } from "@cmv/shared";
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
  list(@Query("tag") tag?: string, @Query("search") search?: string) {
    const filters: ListExercisesFilters = {};
    // Normalisé comme à l'écriture : un filtre « Renfo » doit retrouver le tag « renfo ».
    const parsedTag = tag ? exerciseTagSchema.safeParse(tag) : null;
    if (parsedTag?.success) filters.tag = parsedTag.data;
    const trimmed = search?.trim();
    if (trimmed) filters.search = trimmed;
    return this.exercises.list(filters);
  }

  // Avant `:id`, sinon « tags » serait pris pour un identifiant d'exercice.
  @Get("tags")
  listTags() {
    return this.exercises.listTags();
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
