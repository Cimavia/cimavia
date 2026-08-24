import { Role } from "@cmv/shared";
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { CreateCustomMetricDto } from "../dto/create-custom-metric.dto";
import { UpdateCustomMetricDto } from "../dto/update-custom-metric.dto";
import { CustomMetricService } from "../service/custom-metric.service";

@ApiTags("custom-metrics")
@Roles([Role.COACH])
@Controller("custom-metrics")
export class CustomMetricController {
  constructor(private readonly metrics: CustomMetricService) {}

  @Post()
  create(@Body() dto: CreateCustomMetricDto) {
    return this.metrics.create(dto);
  }

  @Get()
  list() {
    return this.metrics.list();
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCustomMetricDto) {
    return this.metrics.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  delete(@Param("id") id: string) {
    return this.metrics.delete(id);
  }
}
