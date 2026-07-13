import { Role } from "@cmv/shared";
import { Body, Controller, Delete, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { UpdatePlanWeekDto } from "../dto/update-plan-week.dto";
import { PlanService } from "../service/plan.service";

// Ressource à part entière (l'id de semaine suffit à la situer) : évite des routes
// /plans/:planId/weeks/:weekId où le planId ne servirait qu'à répéter ce que la semaine sait.
@ApiTags("plans")
@Roles([Role.COACH])
@Controller("plan-weeks")
export class PlanWeekController {
  constructor(private readonly plans: PlanService) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePlanWeekDto) {
    return this.plans.updateWeek(id, dto);
  }

  // Renumérote les semaines suivantes et fait remonter leurs séances d'une semaine.
  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.plans.deleteWeek(id);
  }
}
