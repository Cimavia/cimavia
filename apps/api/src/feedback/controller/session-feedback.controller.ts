import { Role } from "@cmv/shared";
import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { UpsertSessionFeedbackDto } from "../dto/upsert-session-feedback.dto";
import { FeedbackService } from "../service/feedback.service";

// Surface d'écriture de l'athlète sur ses propres séances — préfixe `me`, comme la lecture de
// sa planification. Le débrief appartient à l'athlète : le coach le lit ailleurs (routes coach).
@ApiTags("feedback")
@Roles([Role.ATHLETE])
@Controller("me/scheduled-sessions/:scheduledSessionId/feedback")
export class SessionFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  // `null` si la séance n'a pas encore été débriefée (pas de 404 : l'absence est un état normal).
  @Get()
  get(@Param("scheduledSessionId") scheduledSessionId: string) {
    return this.feedback.findByScheduledSession(scheduledSessionId);
  }

  // Idempotent : crée le débrief ou le complète, et passe la séance en DONE.
  @Put()
  upsert(
    @Param("scheduledSessionId") scheduledSessionId: string,
    @Body() dto: UpsertSessionFeedbackDto,
  ) {
    return this.feedback.upsert(scheduledSessionId, dto);
  }
}
