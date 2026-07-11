import { Module } from "@nestjs/common";
import { StorageService } from "./storage.service";

// Infra transverse : accès object storage S3 (cf. architecture-choice §2 infra/).
// Importé par les modules qui gèrent des médias (exercise documents, feedback, message).
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
