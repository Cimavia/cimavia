import { Global, Module } from "@nestjs/common";
import { NotificationController } from "./controller/notification.controller";
import { PushTokenController } from "./controller/push-token.controller";
import { NotificationService } from "./notification.service";
import { NotificationFeedService } from "./service/notification-feed.service";
import { PushTokenService } from "./service/push-token.service";

// Global : toute feature qui déclenche un événement métier (planif diffusée, débrief reçu,
// message, facture…) l'émet via ce service, sans réimporter le module à chaque fois.
// Seul `NotificationService` (l'ÉMISSION) est exporté ; la lecture du centre n'est utile qu'ici.
@Global()
@Module({
  controllers: [PushTokenController, NotificationController],
  providers: [NotificationService, NotificationFeedService, PushTokenService],
  exports: [NotificationService],
})
export class NotificationModule {}
