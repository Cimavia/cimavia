import { Module } from "@nestjs/common";
import { CustomMetricController } from "./controller/custom-metric.controller";
import { CustomMetricService } from "./service/custom-metric.service";

// Métriques et échelles maison du coach (#162) — cf. architecture-choice §2.
// Exporté pour `catalogOf` : exercices, séances et planifications lisent les définitions chez le
// propriétaire de l'exercice (piège n°9), au lieu de lire `CustomMetric` en direct (#353).
@Module({
  controllers: [CustomMetricController],
  providers: [CustomMetricService],
  exports: [CustomMetricService],
})
export class CustomMetricModule {}
