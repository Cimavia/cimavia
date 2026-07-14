import { Role } from "@cmv/shared";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { CreateScheduledSessionDto } from "../dto/create-scheduled-session.dto";
import { UpdateScheduledSessionDto } from "../dto/update-scheduled-session.dto";
import { ScheduledSessionService } from "../service/scheduled-session.service";

// Routes coach de la séance planifiée. La création est rattachée à sa semaine (elle n'existe pas
// hors d'un cycle) ; l'édition et la suppression se font par id, comme toute ressource.
@ApiTags("plans")
@Roles([Role.COACH])
@Controller()
export class ScheduledSessionController {
  constructor(private readonly sessions: ScheduledSessionService) {}

  @Post("plan-weeks/:planWeekId/sessions")
  create(@Param("planWeekId") planWeekId: string, @Body() dto: CreateScheduledSessionDto) {
    return this.sessions.create(planWeekId, dto);
  }

  @Get("scheduled-sessions/:id")
  get(@Param("id") id: string) {
    return this.sessions.get(id);
  }

  // Replace-all : titre, consignes, date et composition complète (CDC §5.7).
  @Put("scheduled-sessions/:id")
  update(@Param("id") id: string, @Body() dto: UpdateScheduledSessionDto) {
    return this.sessions.update(id, dto);
  }

  @Delete("scheduled-sessions/:id")
  @HttpCode(204)
  delete(@Param("id") id: string) {
    return this.sessions.delete(id);
  }
}
