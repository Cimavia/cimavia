import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { CustomMetricModule } from "../custom-metric/custom-metric.module";
import { StorageModule } from "../infra/storage/storage.module";
import { ExerciseController } from "./controller/exercise.controller";
import { ExerciseDocumentController } from "./controller/exercise-document.controller";
import { DocumentCleanupService } from "./service/document-cleanup.service";
import { ExerciseService } from "./service/exercise.service";
import { ExerciseCopyService } from "./service/exercise-copy.service";
import { ExerciseDocumentService } from "./service/exercise-document.service";

// Bibliothèque d'exercices du coach (P2) — cf. architecture-choice §2.
// CustomMetricModule : les métriques que les blocs citent se lisent chez le propriétaire (#605).
@Module({
  imports: [StorageModule, CustomMetricModule, AccessModule],
  controllers: [ExerciseController, ExerciseDocumentController],
  providers: [
    ExerciseService,
    ExerciseDocumentService,
    DocumentCleanupService,
    ExerciseCopyService,
  ],
  // `loadAccessibleOrThrow` : la seule garde « ces exercices sont-ils citables ? », que séances et
  // planifications consomment au lieu de la réécrire (#353).
  exports: [ExerciseService],
})
export class ExerciseModule {}
