import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { CreateSessionDto } from "../dto/create-session.dto";
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
  list() {
    return this.sessions.list();
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
  ) {
    return this.sessions.reloadExerciseFromLibrary(sessionId, sessionExerciseId);
  }

  @Delete(":id")
  @HttpCode(204)
  delete(@Param("id") id: string) {
    return this.sessions.delete(id);
  }
}
