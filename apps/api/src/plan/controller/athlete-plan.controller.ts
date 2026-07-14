import { Role } from "@cmv/shared";
import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { AthletePlanService } from "../service/athlete-plan.service";

// Surface de lecture de l'athlète : deux routes suffisent aux trois écrans mobiles (planning,
// liste des séances, détail). Aucune écriture — le cycle appartient au coach.
@ApiTags("plans")
@Roles([Role.ATHLETE])
@Controller("me")
export class AthletePlanController {
  constructor(private readonly plans: AthletePlanService) {}

  // Le cycle courant avec ses semaines et ses séances — `null` si aucun plan diffusé.
  @Get("plan")
  myPlan() {
    return this.plans.myCurrentPlan();
  }

  @Get("scheduled-sessions/:id")
  getSession(@Param("id") id: string) {
    return this.plans.getScheduledSession(id);
  }
}
