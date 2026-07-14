import { Module } from "@nestjs/common";
import { StorageModule } from "../infra/storage/storage.module";
import { PlanController } from "./controller/plan.controller";
import { PlanWeekController } from "./controller/plan-week.controller";
import { ScheduledSessionController } from "./controller/scheduled-session.controller";
import { PlanService } from "./service/plan.service";
import { ScheduledSessionService } from "./service/scheduled-session.service";

// Planifications (P3) : cycles, semaines et séances planifiées (copies éditables des modèles).
// StorageModule : les documents copiés sont servis en URLs GET signées, comme en bibliothèque.
@Module({
  imports: [StorageModule],
  controllers: [PlanController, PlanWeekController, ScheduledSessionController],
  providers: [PlanService, ScheduledSessionService],
  exports: [PlanService],
})
export class PlanModule {}
