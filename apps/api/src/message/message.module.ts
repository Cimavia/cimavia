import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module";
import { StorageModule } from "../infra/storage/storage.module";
import { ConversationController } from "./controller/conversation.controller";
import { MessageController } from "./controller/message.controller";
import { ConversationService } from "./service/conversation.service";
import { MessageService } from "./service/message.service";
import { MessageMediaService } from "./service/message-media.service";

// Messagerie (P5) : fil 1:1 coach ↔ athlète, lu et écrit par les deux rôles.
// AccountModule : résolution des noms de contrepartie (User est hors scope tenant).
// StorageModule : médias servis en URLs GET signées.
// NotificationService (push) et ClsService (acteur courant) sont globaux — pas d'import ici.
@Module({
  imports: [StorageModule, AccountModule],
  controllers: [ConversationController, MessageController],
  providers: [ConversationService, MessageService, MessageMediaService],
})
export class MessageModule {}
