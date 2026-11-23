import { Module } from "@nestjs/common";
import { ObjectPurgeService } from "./object-purge.service";
import { OrphanSweepService } from "./orphan-sweep.service";
import { StorageService } from "./storage.service";

// Infra transverse : accès object storage S3 (cf. architecture-choice §2 infra/).
// Importé par les modules qui gèrent des médias (exercise documents, feedback, message).
@Module({
  // `OrphanSweepService` n'est pas exporté : seule la commande de balayage le lit (#72).
  providers: [StorageService, ObjectPurgeService, OrphanSweepService],
  exports: [StorageService, ObjectPurgeService],
})
export class StorageModule {}
