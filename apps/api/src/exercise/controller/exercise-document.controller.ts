import { type AttachDocumentInput, attachDocumentSchema, Role } from "@cmv/shared";
import { Body, Controller, Delete, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { RequestUploadUrlDto } from "../dto/request-upload-url.dto";
import { ExerciseDocumentService } from "../service/exercise-document.service";

// Documents joints d'un exercice : upload par URL signée (client → S3) puis rattachement.
// Réservé au coach (rôle + scope coachId de l'exercice parent via tenancy layer).
@ApiTags("exercise-documents")
@Roles([Role.COACH])
@Controller("exercises/:exerciseId/documents")
export class ExerciseDocumentController {
  constructor(private readonly documents: ExerciseDocumentService) {}

  // Étape 1 : demander une URL PUT signée avant d'envoyer le fichier vers l'object storage.
  @Post("upload-url")
  createUploadUrl(@Param("exerciseId") exerciseId: string, @Body() dto: RequestUploadUrlDto) {
    return this.documents.createUploadUrl(exerciseId, dto);
  }

  // Étape 2 : rattacher le document (FILE après upload, ou LINK externe).
  // Union discriminée → validée par un pipe de schéma (pas de classe DTO possible).
  @Post()
  attach(
    @Param("exerciseId") exerciseId: string,
    @Body(new ZodSchemaPipe(attachDocumentSchema)) dto: AttachDocumentInput,
  ) {
    return this.documents.attach(exerciseId, dto);
  }

  @Delete(":documentId")
  @HttpCode(204)
  remove(@Param("exerciseId") exerciseId: string, @Param("documentId") documentId: string) {
    return this.documents.remove(exerciseId, documentId);
  }
}
