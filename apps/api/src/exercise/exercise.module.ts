import { Module } from "@nestjs/common";
import { StorageModule } from "../infra/storage/storage.module";
import { ExerciseController } from "./controller/exercise.controller";
import { ExerciseDocumentController } from "./controller/exercise-document.controller";
import { DocumentCleanupService } from "./service/document-cleanup.service";
import { ExerciseService } from "./service/exercise.service";
import { ExerciseDocumentService } from "./service/exercise-document.service";

// Bibliothèque d'exercices du coach (P2) — cf. architecture-choice §2.
@Module({
  imports: [StorageModule],
  controllers: [ExerciseController, ExerciseDocumentController],
  providers: [ExerciseService, ExerciseDocumentService, DocumentCleanupService],
})
export class ExerciseModule {}
