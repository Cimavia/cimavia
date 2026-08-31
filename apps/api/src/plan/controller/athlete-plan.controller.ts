import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { AthletePlanService } from "../service/athlete-plan.service";

// Surface de lecture de l'athlète : deux routes suffisent aux trois écrans mobiles (planning,
// liste des séances, détail). Aucune écriture — le cycle appartient au coach.
@ApiTags("plans")
@RequireCapability("athlete")
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
