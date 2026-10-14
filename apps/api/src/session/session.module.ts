import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { CustomMetricModule } from "../custom-metric/custom-metric.module";
import { ExerciseModule } from "../exercise/exercise.module";
import { SessionController } from "./controller/session.controller";
import { SessionService } from "./service/session.service";

// ExerciseModule : la garde des exercices cités (`loadAccessibleOrThrow`, #353).
// CustomMetricModule : les métriques que les blocs citent, chez le propriétaire de l'exercice.
@Module({
  imports: [ExerciseModule, CustomMetricModule, AccessModule],
  controllers: [SessionController],
  providers: [SessionService],
})
export class SessionModule {}
