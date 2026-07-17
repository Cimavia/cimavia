import { Global, Module } from "@nestjs/common";
import { PushTokenController } from "./controller/push-token.controller";
import { NotificationService } from "./notification.service";
import { PushTokenService } from "./service/push-token.service";

// Global : toute feature qui déclenche un événement métier (planif diffusée, débrief reçu,
// message, facture…) l'émet via ce service, sans réimporter le module à chaque fois.
@Global()
@Module({
  controllers: [PushTokenController],
  providers: [NotificationService, PushTokenService],
  exports: [NotificationService],
})
export class NotificationModule {}
