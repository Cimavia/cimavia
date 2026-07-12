import { Role } from "@cmv/shared";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { CreateSessionDto } from "../dto/create-session.dto";
import { UpdateSessionDto } from "../dto/update-session.dto";
import { SessionService } from "../service/session.service";

@ApiTags("sessions")
@Roles([Role.COACH])
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

  @Delete(":id")
  @HttpCode(204)
  delete(@Param("id") id: string) {
    return this.sessions.delete(id);
  }
}
