import {
  type LibraryScopeQuery,
  libraryScopeQuerySchema,
  type VersionQuery,
  versionQuerySchema,
} from "@cmv/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ChangeAccessDto } from "../../access/dto/change-access.dto";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { CreateSessionDto } from "../dto/create-session.dto";
import { ReloadSessionExerciseDto } from "../dto/reload-session-exercise.dto";
import { UpdateSessionDto } from "../dto/update-session.dto";
import { SessionService } from "../service/session.service";

@ApiTags("sessions")
@RequireCapability("coach")
@Controller("sessions")
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Post()
  create(@Body() dto: CreateSessionDto) {
    return this.sessions.create(dto);
  }

  @Get()
  list(@Query(new ZodSchemaPipe(libraryScopeQuerySchema)) query: LibraryScopeQuery) {
    return this.sessions.list(query.scope);
  }

  // Avant `:id`, comme pour les exercices : les routes d'une ressource se lisent ensemble.
  @Patch("access")
  changeAccess(@Body() dto: ChangeAccessDto) {
    return this.sessions.changeAccess(dto);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.sessions.get(id);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateSessionDto) {
    return this.sessions.update(id, dto);
  }

  /**
   * `POST` et non `PUT` : ce n'est pas la mise à jour d'une ressource mais une ACTION, qui relit
   * la bibliothèque et écrase la carte. Le client confirme avant de l'appeler.
   */
  @Post(":sessionId/exercises/:sessionExerciseId/reload")
  reload(
    @Param("sessionId") sessionId: string,
    @Param("sessionExerciseId") sessionExerciseId: string,
    @Body() dto: ReloadSessionExerciseDto,
  ) {
    return this.sessions.reloadExerciseFromLibrary(sessionId, sessionExerciseId, dto);
  }

  // Sous la version lue (#605, MC-8) : la séance peut être écrite par d'autres Coachs.
  @Delete(":id")
  @HttpCode(204)
  delete(
    @Param("id") id: string,
    @Query(new ZodSchemaPipe(versionQuerySchema)) query: VersionQuery,
  ) {
    return this.sessions.delete(id, query);
  }
}
