import { type CreateConversationInput, createConversationSchema } from "@cmv/shared";
import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireCapability } from "../../auth/decorator/require-capability.decorator";
import { ZodSchemaPipe } from "../../zod/zod-schema.pipe";
import { ConversationService } from "../service/conversation.service";
import { MessageService } from "../service/message.service";

@ApiTags("messages")
@RequireCapability("either")
@Controller("conversations")
export class ConversationController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly messages: MessageService,
  ) {}

  // Get-or-create : mêmes participants, même conversation — le client l'appelle à l'ouverture
  // d'un fil pour obtenir un id stable.
  @Post()
  create(@Body(new ZodSchemaPipe(createConversationSchema)) dto: CreateConversationInput) {
    return this.conversations.create(dto);
  }

  // Liste des conversations de l'acteur, au titre exercé.
  @Get()
  list() {
    return this.conversations.list();
  }

  // Ceux que l'acteur peut réunir dans une conversation (#611).
  @Get("candidates")
  candidates() {
    return this.conversations.candidatesOf();
  }

  // Pose la marque de lecture de l'acteur (appelé à l'ouverture de l'écran de conversation).
  @Post(":conversationId/read")
  @HttpCode(204)
  markRead(@Param("conversationId") conversationId: string) {
    return this.messages.markRead(conversationId);
  }
}
