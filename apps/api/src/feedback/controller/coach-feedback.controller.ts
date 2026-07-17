import { Role } from "@cmv/shared";
import { Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { CoachFeedbackService } from "../service/coach-feedback.service";
import { FeedbackService } from "../service/feedback.service";

// Lecture coach des débriefs de ses athlètes. Aucune écriture du débrief lui-même : il
// appartient à l'athlète — le coach ne fait que le lire et le marquer comme lu.
@ApiTags("feedback")
@Roles([Role.COACH])
@Controller()
export class CoachFeedbackController {
  constructor(
    private readonly coachFeedback: CoachFeedbackService,
    private readonly feedback: FeedbackService,
  ) {}

  @Get("feedbacks")
  list() {
    return this.coachFeedback.list();
  }

  @Post("feedbacks/:id/read")
  markRead(@Param("id") id: string) {
    return this.coachFeedback.markRead(id);
  }

  // Détail du débrief d'une séance — `null` si elle n'a pas encore été débriefée.
  @Get("scheduled-sessions/:scheduledSessionId/feedback")
  getBySession(@Param("scheduledSessionId") scheduledSessionId: string) {
    return this.feedback.findByScheduledSession(scheduledSessionId);
  }
}
