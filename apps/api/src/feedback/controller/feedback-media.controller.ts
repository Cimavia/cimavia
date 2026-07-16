import {
  type AttachFeedbackMediaInput,
  attachFeedbackMediaSchema,
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

  // Étape 1 : demander une URL PUT signée avant d'envoyer le fichier vers l'object storage.
  @Post("upload-url")
  createUploadUrl(
    @Param("scheduledSessionId") scheduledSessionId: string,
    @Body(new ZodSchemaPipe(requestFeedbackUploadUrlSchema)) dto: RequestFeedbackUploadUrlInput,
  ) {
    return this.media.createUploadUrl(scheduledSessionId, dto);
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
