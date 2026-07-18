import { type OpenConversationInput, openConversationSchema, Role } from "@cmv/shared";
import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Roles } from "@thallesp/nestjs-better-auth";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { ConversationService } from "../service/conversation.service";
import { MessageService } from "../service/message.service";

@ApiTags("messages")
@Roles([Role.COACH, Role.ATHLETE])
@Controller("conversations")
export class ConversationController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly messages: MessageService,
  ) {}

  // Get-or-create : le client l'appelle à l'ouverture d'un fil pour obtenir un id stable.
  @Post()
  open(@Body(new ZodSchemaPipe(openConversationSchema)) dto: OpenConversationInput) {
    return this.conversations.open(dto);
  }

  // Liste des fils existants (surtout le coach, qui en a N).
  @Get()
  list() {
    return this.conversations.list();
  }

  // Marque lus les messages entrants du fil (appelé à l'ouverture de l'écran de conversation).
  @Post(":conversationId/read")
  @HttpCode(204)
  markRead(@Param("conversationId") conversationId: string) {
    return this.messages.markRead(conversationId);
  }
}
