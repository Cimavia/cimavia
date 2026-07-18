import { Role, type SendMessageInput, sendMessageSchema } from "@cmv/shared";
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { MessageService } from "../service/message.service";

@ApiTags("messages")
@Roles([Role.COACH, Role.ATHLETE])
@Controller("conversations/:conversationId/messages")
export class MessageController {
  constructor(private readonly messages: MessageService) {}

  @Get()
  list(@Param("conversationId") conversationId: string) {
    return this.messages.listMessages(conversationId);
  }

  @Post()
  send(
    @Param("conversationId") conversationId: string,
    @Body(new ZodSchemaPipe(sendMessageSchema)) dto: SendMessageInput,
  ) {
    return this.messages.send(conversationId, dto);
  }
}
