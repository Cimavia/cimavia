import { Module } from "@nestjs/common";
import { StorageModule } from "../infra/storage/storage.module";
import { PlanModule } from "../plan/plan.module";
import { SessionFeedbackController } from "./controller/session-feedback.controller";
import { FeedbackService } from "./service/feedback.service";

// Débrief de séance (P4) : écrit par l'athlète, lu par le coach.
// PlanModule : garde « séance de l'athlète courant, dans un cycle PUBLISHED » (AthletePlanService).
// StorageModule : les médias sont servis en URLs GET signées, comme les documents.
@Module({
  imports: [PlanModule, StorageModule],
  controllers: [SessionFeedbackController],
  providers: [FeedbackService],
  exports: [FeedbackService],
})
export class FeedbackModule {}
