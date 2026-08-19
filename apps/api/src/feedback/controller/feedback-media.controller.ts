import {
  type AbortMultipartUploadInput,
  type AttachFeedbackMediaInput,
  abortMultipartUploadSchema,
  attachFeedbackMediaSchema,
  type CompleteMultipartUploadInput,
  completeMultipartUploadSchema,
  type RequestFeedbackUploadUrlInput,
  Role,
  requestFeedbackUploadUrlSchema,
} from "@cmv/shared";
import { Body, Controller, Delete, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { FeedbackMediaService } from "../service/feedback-media.service";

// Photos / vidéos d'un débrief : upload par URL signée (client → storage) puis rattachement.
// Écriture d'athlète uniquement — le coach lit les médias, il n'en dépose pas.
// Les deux entrées sont des unions discriminées (IMAGE | VIDEO) → pipe de schéma par route,
// une classe DTO ne pouvant pas étendre un type union.
@ApiTags("feedback")
@Roles([Role.ATHLETE])
@Controller("me/scheduled-sessions/:scheduledSessionId/feedback/media")
export class FeedbackMediaController {
  constructor(private readonly media: FeedbackMediaService) {}

  // Étape 1 : demander un ticket d'upload avant d'envoyer le fichier vers l'object storage. Le
  // ticket dit au client s'il pousse en un PUT ou part par part (cf. `upload.schema.ts`).
  @Post("upload-url")
  createUploadUrl(
    @Param("scheduledSessionId") scheduledSessionId: string,
    @Body(new ZodSchemaPipe(requestFeedbackUploadUrlSchema)) dto: RequestFeedbackUploadUrlInput,
  ) {
    return this.media.createUploadUrl(scheduledSessionId, dto);
  }

  // Étape 2 bis, mode découpé UNIQUEMENT : recoller les parts en un objet. 204 — il n'y a rien à
  // rendre, l'objet est désigné par le `storagePath` que le client détient déjà.
  @Post("upload/complete")
  @HttpCode(204)
  completeUpload(
    @Param("scheduledSessionId") scheduledSessionId: string,
    @Body(new ZodSchemaPipe(completeMultipartUploadSchema)) dto: CompleteMultipartUploadInput,
  ) {
    return this.media.completeUpload(scheduledSessionId, dto);
  }

  // Renoncer à un envoi découpé. Distinct de la suppression d'un média : ici rien n'a jamais
  // existé côté bucket, il n'y a que des parts à purger.
  @Post("upload/abort")
  @HttpCode(204)
  abortUpload(
    @Param("scheduledSessionId") scheduledSessionId: string,
    @Body(new ZodSchemaPipe(abortMultipartUploadSchema)) dto: AbortMultipartUploadInput,
  ) {
    return this.media.abortUpload(scheduledSessionId, dto);
  }

  // Étape 2 : rattacher le média (crée le débrief s'il n'existe pas — débrief média-seul).
  @Post()
  attach(
    @Param("scheduledSessionId") scheduledSessionId: string,
    @Body(new ZodSchemaPipe(attachFeedbackMediaSchema)) dto: AttachFeedbackMediaInput,
  ) {
    return this.media.attach(scheduledSessionId, dto);
  }

  @Delete(":mediaId")
  @HttpCode(204)
  remove(
    @Param("scheduledSessionId") scheduledSessionId: string,
    @Param("mediaId") mediaId: string,
  ) {
    return this.media.remove(scheduledSessionId, mediaId);
  }
}
