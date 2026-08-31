import { Module } from "@nestjs/common";
import { CustomMetricController } from "./controller/custom-metric.controller";
import { CustomMetricService } from "./service/custom-metric.service";

// Métriques et échelles maison du coach (#162) — cf. architecture-choice §2.
@Module({
  controllers: [CustomMetricController],
  providers: [CustomMetricService],
})
export class CustomMetricModule {}
