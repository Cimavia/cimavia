import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module";
import { StorageModule } from "../infra/storage/storage.module";
import { PlanModule } from "../plan/plan.module";
import { CoachFeedbackController } from "./controller/coach-feedback.controller";
import { FeedbackMediaController } from "./controller/feedback-media.controller";
import { SessionFeedbackController } from "./controller/session-feedback.controller";
import { CoachFeedbackService } from "./service/coach-feedback.service";
import { FeedbackService } from "./service/feedback.service";
import { FeedbackMediaService } from "./service/feedback-media.service";

// Débrief de séance (P4) : écrit par l'athlète, lu par le coach.
// AccountModule : résolution des noms d'athlètes (User est hors scope tenant).
// PlanModule : garde « séance de l'athlète courant, dans un cycle PUBLISHED » (AthletePlanService).
// StorageModule : les médias sont servis en URLs GET signées, comme les documents.
@Module({
  imports: [PlanModule, StorageModule, AccountModule],
  controllers: [SessionFeedbackController, FeedbackMediaController, CoachFeedbackController],
  providers: [FeedbackService, FeedbackMediaService, CoachFeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
