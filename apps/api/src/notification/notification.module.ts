import { Global, Module } from "@nestjs/common";
import { NotificationService } from "./notification.service";

// Global : toute feature qui déclenche un événement métier (planif diffusée, message reçu,
// facture émise…) l'émet via ce service, sans réimporter le module à chaque fois.
@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
