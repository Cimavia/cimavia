import {
  type AbortMultipartUploadInput,
  abortMultipartUploadSchema,
  type CompleteMultipartUploadInput,
  completeMultipartUploadSchema,
  type RequestMessageUploadUrlInput,
  requestMessageUploadUrlSchema,
  type SendMessageInput,
  sendMessageSchema,
} from "@cmv/shared";
import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { MessageService } from "../service/message.service";
import { MessageMediaService } from "../service/message-media.service";

// Messages d'un fil. `sendMessageSchema` et `requestMessageUploadUrlSchema` sont des unions
// discriminées (texte | média) → pipe de schéma par route, une classe DTO ne pouvant pas étendre
// un type union.
@ApiTags("messages")
@RequireCapability("either")
@Controller("conversations/:conversationId/messages")
export class MessageController {
  constructor(
    private readonly messages: MessageService,
    private readonly media: MessageMediaService,
  ) {}

  @Get()
  list(@Param("conversationId") conversationId: string) {
    return this.messages.listMessages(conversationId);
  }

  // Média : demander un ticket d'upload avant d'envoyer le fichier vers l'object storage. Le
  // ticket dit au client s'il pousse en un PUT ou part par part (cf. `upload.schema.ts`).
  @Post("upload-url")
  createUploadUrl(
    @Param("conversationId") conversationId: string,
    @Body(new ZodSchemaPipe(requestMessageUploadUrlSchema)) dto: RequestMessageUploadUrlInput,
  ) {
    return this.media.createUploadUrl(conversationId, dto);
  }

  // Mode découpé UNIQUEMENT : recoller les parts en un objet. 204 — l'objet est désigné par le
  // `storagePath` que le client détient déjà.
  @Post("upload/complete")
  @HttpCode(204)
  completeUpload(
    @Param("conversationId") conversationId: string,
    @Body(new ZodSchemaPipe(completeMultipartUploadSchema)) dto: CompleteMultipartUploadInput,
  ) {
    return this.media.completeUpload(conversationId, dto);
  }

  // Renoncer à un envoi découpé : rien n'a jamais existé côté bucket, il n'y a que des parts à
  // purger.
  @Post("upload/abort")
  @HttpCode(204)
  abortUpload(
    @Param("conversationId") conversationId: string,
    @Body(new ZodSchemaPipe(abortMultipartUploadSchema)) dto: AbortMultipartUploadInput,
  ) {
    return this.media.abortUpload(conversationId, dto);
  }

  @Post()
  send(
    @Param("conversationId") conversationId: string,
    @Body(new ZodSchemaPipe(sendMessageSchema)) dto: SendMessageInput,
  ) {
    return this.messages.send(conversationId, dto);
  }
}
