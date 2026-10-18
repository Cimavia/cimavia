import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { AccountModule } from "../account/account.module";
import { StorageModule } from "../infra/storage/storage.module";
import { PlanModule } from "../plan/plan.module";
import { ConversationController } from "./controller/conversation.controller";
import { MessageController } from "./controller/message.controller";
import { ConversationService } from "./service/conversation.service";
import { ConversationCandidateService } from "./service/conversation-candidate.service";
import { FeedbackAnnouncerService } from "./service/feedback-announcer.service";
import { MessageService } from "./service/message.service";
import { MessageAttachmentResolver } from "./service/message-attachment.resolver";
import { MessageMediaService } from "./service/message-media.service";

// Messagerie (P5) : conversations à participants (#611), à deux ou à plusieurs, lues et écrites
// par chacun d'eux.
// AccountModule : résolution des noms des participants (User est hors scope tenant).
// AccessModule : les entreprises de l'acteur, dont les Coachs sont ceux qu'il peut réunir.
// StorageModule : médias servis en URLs GET signées.
// PlanModule : garde « séance PUBLISHED de l'athlète » pour valider un rattachement (AthletePlanService).
// NotificationService (push) et ClsService (acteur courant) sont globaux — pas d'import ici.
@Module({
  imports: [StorageModule, AccountModule, AccessModule, PlanModule],
  controllers: [ConversationController, MessageController],
  providers: [
    ConversationService,
    ConversationCandidateService,
    MessageService,
    MessageMediaService,
    MessageAttachmentResolver,
    FeedbackAnnouncerService,
  ],
  // Le débrief rend les messages qui lui sont rattachés : il lui faut le même résolveur, et le
  // même mapper. Il pose aussi ses avis dans le fil (#96), d'où l'annonceur. Sens unique — la
  // messagerie n'importe pas FeedbackModule.
  exports: [MessageAttachmentResolver, FeedbackAnnouncerService],
})
export class MessageModule {}
