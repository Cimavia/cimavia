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

  /**
   * Tous les cycles diffusés que l'athlète voit, semaines et séances comprises — liste vide s'il
   * n'en a aucun (#172). Ils s'ACCUMULENT : un second cycle diffusé n'en remplace pas un premier.
   */
  @Get("plans")
  myPlans() {
    return this.plans.myVisiblePlans();
  }

  @Get("scheduled-sessions/:id")
  getSession(@Param("id") id: string) {
    return this.plans.getScheduledSession(id);
  }
}
