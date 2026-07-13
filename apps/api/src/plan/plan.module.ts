import { Module } from "@nestjs/common";
import { PlanController } from "./controller/plan.controller";
import { PlanWeekController } from "./controller/plan-week.controller";
import { PlanService } from "./service/plan.service";

@Module({
  controllers: [PlanController, PlanWeekController],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
