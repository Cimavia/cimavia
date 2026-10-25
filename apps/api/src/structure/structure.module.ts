import { Module } from "@nestjs/common";
import { StructureController } from "./controller/structure.controller";
import { StructureService } from "./service/structure.service";

// Bibliothèque › Structures (#716) : ce qu'un bloc de séance copie.
@Module({
  controllers: [StructureController],
  providers: [StructureService],
})
export class StructureModule {}
