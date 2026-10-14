import {
  exerciseTagSchema,
  type LibraryScope,
  libraryScopeSchema,
  type VersionQuery,
  versionQuerySchema,
} from "@cmv/shared";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ChangeAccessDto } from "../../access/dto/change-access.dto";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { CreateExerciseDto } from "../dto/create-exercise.dto";
import { DuplicateExerciseDto } from "../dto/duplicate-exercise.dto";
import { UpdateExerciseDto } from "../dto/update-exercise.dto";
import type { ListExercisesFilters } from "../exercise.where";
import { ExerciseService } from "../service/exercise.service";

@ApiTags("exercises")
@RequireCapability("coach")
@Controller("exercises")
export class ExerciseController {
  constructor(private readonly exercises: ExerciseService) {}

  @Post()
  create(@Body() dto: CreateExerciseDto) {
    return this.exercises.create(dto);
  }

  @Get()
  list(
    @Query("scope", new ZodSchemaPipe(libraryScopeSchema)) scope: LibraryScope,
    @Query("tag") tag?: string,
    @Query("search") search?: string,
  ) {
    const filters: ListExercisesFilters = {};
    // Normalisé comme à l'écriture : un filtre « Renfo » doit retrouver le tag « renfo ».
    const parsedTag = tag ? exerciseTagSchema.safeParse(tag) : null;
    if (parsedTag?.success) filters.tag = parsedTag.data;
    const trimmed = search?.trim();
    if (trimmed) filters.search = trimmed;
    return this.exercises.list(filters, scope);
  }

  // Avant `:id`, sinon « tags » serait pris pour un identifiant d'exercice.
  @Get("tags")
  listTags() {
    return this.exercises.listTags();
  }

  // Avant `:id` : `PATCH /exercises/access` serait pris pour la mise à jour d'un exercice « access ».
  @Patch("access")
  changeAccess(@Body() dto: ChangeAccessDto) {
    return this.exercises.changeAccess(dto);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.exercises.get(id);
  }

  @Get(":id/custom-metrics")
  customMetrics(@Param("id") id: string) {
    return this.exercises.customMetricsOf(id);
  }

  @Post(":id/duplicate")
  duplicate(@Param("id") id: string, @Body() dto: DuplicateExerciseDto) {
    return this.exercises.duplicate(id, dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateExerciseDto) {
    return this.exercises.update(id, dto);
  }

  // Sous la version lue (#605, MC-8) : l'exercice peut être écrit par d'autres Coachs.
  @Delete(":id")
  @HttpCode(204)
  delete(
    @Param("id") id: string,
    @Query(new ZodSchemaPipe(versionQuerySchema)) query: VersionQuery,
  ) {
    return this.exercises.delete(id, query);
  }
}
