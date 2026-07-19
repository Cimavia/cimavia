import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module";
import { InvoiceController } from "./controller/invoice.controller";
import { InvoiceService } from "./service/invoice.service";

// Facturation (P6) : émise par le coach, lue par l'athlète.
// AccountModule : résolution des noms coach/athlète (User est hors scope tenant).
// NotificationService (push) et ClsService (acteur courant) sont globaux — pas d'import ici.
@Module({
  imports: [AccountModule],
  controllers: [InvoiceController],
  providers: [InvoiceService],
})
export class InvoiceModule {}
