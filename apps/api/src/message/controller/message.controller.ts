import {
  type RequestMessageUploadUrlInput,
  Role,
  requestMessageUploadUrlSchema,
  type SendMessageInput,
  sendMessageSchema,
} from "@cmv/shared";
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { MessageService } from "../service/message.service";
import { MessageMediaService } from "../service/message-media.service";

// Messages d'un fil. `sendMessageSchema` et `requestMessageUploadUrlSchema` sont des unions
// discriminées (texte | média) → pipe de schéma par route, une classe DTO ne pouvant pas étendre
// un type union.
@ApiTags("messages")
@Roles([Role.COACH, Role.ATHLETE])
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

  // Média : demander une URL PUT signée avant d'envoyer le fichier vers l'object storage.
  @Post("upload-url")
  createUploadUrl(
    @Param("conversationId") conversationId: string,
    @Body(new ZodSchemaPipe(requestMessageUploadUrlSchema)) dto: RequestMessageUploadUrlInput,
  ) {
    return this.media.createUploadUrl(conversationId, dto);
  }

  @Post()
  send(
    @Param("conversationId") conversationId: string,
    @Body(new ZodSchemaPipe(sendMessageSchema)) dto: SendMessageInput,
  ) {
    return this.messages.send(conversationId, dto);
  }
}
