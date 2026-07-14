import { Module } from "@nestjs/common";
import { StorageModule } from "../infra/storage/storage.module";
import { AthletePlanController } from "./controller/athlete-plan.controller";
import { PlanController } from "./controller/plan.controller";
import { PlanWeekController } from "./controller/plan-week.controller";
import { ScheduledSessionController } from "./controller/scheduled-session.controller";
import { AthletePlanService } from "./service/athlete-plan.service";
import { PlanService } from "./service/plan.service";
import { ScheduledSessionService } from "./service/scheduled-session.service";

// Planifications (P3) : cycles, semaines et séances planifiées (copies éditables des modèles).
// Écriture réservée au coach ; lecture athlète isolée dans AthletePlanService (filtre PUBLISHED).
// StorageModule : les documents copiés sont servis en URLs GET signées, comme en bibliothèque.
@Module({
  imports: [StorageModule],
  controllers: [
    PlanController,
    PlanWeekController,
    ScheduledSessionController,
    AthletePlanController,
  ],
  providers: [PlanService, ScheduledSessionService, AthletePlanService],
  exports: [PlanService],
})
export class PlanModule {}
