import { Global, Module } from "@nestjs/common";
import { MailModule } from "../infra/mail/mail.module";
import { ReminderModule } from "../reminder/reminder.module";
import { NotificationController } from "./controller/notification.controller";
import { NotificationEmailPreferenceController } from "./controller/notification-email-preference.controller";
import { PushTokenController } from "./controller/push-token.controller";
import { NotificationService } from "./notification.service";
import { NotificationEmailPreferenceService } from "./service/notification-email-preference.service";
import { NotificationFeedService } from "./service/notification-feed.service";
import { PushTokenService } from "./service/push-token.service";

// Global : toute feature qui déclenche un événement métier (planif diffusée, débrief reçu,
// message, facture…) l'émet via ce service, sans réimporter le module à chaque fois.
// Seul `NotificationService` (l'ÉMISSION) est exporté ; la lecture du centre n'est utile qu'ici.
//
// ReminderModule : le centre a une seconde source depuis #51 — les rappels DUS du coach, calculés à
// la lecture. La table `reminder` reste accessible depuis son seul module (ReminderService), ce qui
// évite de dupliquer ici le prédicat « dû » et le scope. Pas de cycle : ReminderModule n'importe rien.
@Global()
@Module({
  // MailModule : le troisième canal des notifications (#65). Importé et non global — l'envoi
  // d'e-mails n'a pas à être visible de tout le monde.
  imports: [ReminderModule, MailModule],
  controllers: [PushTokenController, NotificationController, NotificationEmailPreferenceController],
  providers: [
    NotificationService,
    NotificationFeedService,
    NotificationEmailPreferenceService,
    PushTokenService,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
