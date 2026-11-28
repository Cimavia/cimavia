import { type VersionQuery, versionQuerySchema } from "@cmv/shared";
import { Body, Controller, Delete, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { CopyPlanWeekDto } from "../dto/copy-plan-week.dto";
import { InsertPlanWeekDto } from "../dto/insert-plan-week.dto";
import { UpdatePlanWeekDto } from "../dto/update-plan-week.dto";
import { PlanWeekService } from "../service/plan-week.service";
import { PlanWeekCopyService } from "../service/plan-week-copy.service";

// Ressource à part entière (l'id de semaine suffit à la situer) : évite des routes
// /plans/:planId/weeks/:weekId où le planId ne servirait qu'à répéter ce que la semaine sait.
@ApiTags("plans")
@RequireCapability("coach")
@Controller("plan-weeks")
export class PlanWeekController {
  constructor(
    private readonly weeks: PlanWeekService,
    private readonly copies: PlanWeekCopyService,
  ) {}

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePlanWeekDto) {
    return this.weeks.updateWeek(id, dto);
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

  /**
   * Insère une semaine AVANT celle-ci (#231) : elle prend son rang, et la suite glisse d'une
   * semaine, séances comprises. Sur un cycle diffusé, l'athlète en est prévenu.
   */
  @Post(":id/insert-before")
  insertBefore(@Param("id") id: string, @Body() dto: InsertPlanWeekDto) {
    return this.weeks.insertWeekBefore(id, dto);
  }

  // Renumérote les semaines suivantes et fait remonter leurs séances d'une semaine. Sans corps :
  // la version de la semaine lue voyage en `?expectedUpdatedAt=` (#604).
  @Delete(":id")
  delete(
    @Param("id") id: string,
    @Query(new ZodSchemaPipe(versionQuerySchema)) query: VersionQuery,
  ) {
    return this.weeks.deleteWeek(id, query);
  }
}
