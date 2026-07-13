import { Role } from "@cmv/shared";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { AddPlanWeekDto } from "../dto/add-plan-week.dto";
import { CreatePlanDto } from "../dto/create-plan.dto";
import { UpdatePlanDto } from "../dto/update-plan.dto";
import { type ListPlansFilters, PlanService } from "../service/plan.service";

@ApiTags("plans")
@Roles([Role.COACH])
@Controller("plans")
export class PlanController {
  constructor(private readonly plans: PlanService) {}

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Get()
  list(@Query("athleteId") athleteId?: string) {
    const filters: ListPlansFilters = {};
    if (athleteId) filters.athleteId = athleteId;
    return this.plans.list(filters);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.plans.get(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  delete(@Param("id") id: string) {
    return this.plans.delete(id);
  }

  // La semaine est ajoutée en fin de cycle ; la réponse est le plan complet (le builder web
  // n'a pas à recomposer l'arbre côté client).
  @Post(":id/weeks")
  addWeek(@Param("id") id: string, @Body() dto: AddPlanWeekDto) {
    return this.plans.addWeek(id, dto);
  }
}
