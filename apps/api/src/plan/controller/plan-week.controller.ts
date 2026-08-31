import { Body, Controller, Delete, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { CopyPlanWeekDto } from "../dto/copy-plan-week.dto";
import { UpdatePlanWeekDto } from "../dto/update-plan-week.dto";
import { PlanService } from "../service/plan.service";
import { PlanWeekCopyService } from "../service/plan-week-copy.service";

// Ressource à part entière (l'id de semaine suffit à la situer) : évite des routes
// /plans/:planId/weeks/:weekId où le planId ne servirait qu'à répéter ce que la semaine sait.
@ApiTags("plans")
@RequireCapability("coach")
@Controller("plan-weeks")
export class PlanWeekController {
  constructor(
    private readonly plans: PlanService,
    private readonly copies: PlanWeekCopyService,
  ) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePlanWeekDto) {
    return this.plans.updateWeek(id, dto);
  }

  /**
   * Colle le contenu d'une autre semaine ICI (#4). La cible est la ressource de la route — c'est
   * elle qui est écrite, et son contenu est REMPLACÉ ; la source ne voyage que dans le corps.
   *
   * D'où deux refus de nature différente : la cible inconnue est un 404, comme sur toute autre
   * route `plan-weeks/:id` ; la source inconnue est un 400, parce qu'une référence entrante qui
   * répondrait 404 confirmerait l'existence d'un id appartenant à un autre coach.
   */
  @Post(":id/copy-from")
  copyFrom(@Param("id") id: string, @Body() dto: CopyPlanWeekDto) {
    return this.copies.copyWeek(id, dto);
  }

  // Renumérote les semaines suivantes et fait remonter leurs séances d'une semaine.
  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.plans.deleteWeek(id);
  }
}
