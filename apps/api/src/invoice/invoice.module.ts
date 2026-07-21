import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module";
import { InvoiceController } from "./controller/invoice.controller";
import { PlanBillingController } from "./controller/plan-billing.controller";
import { InvoiceService } from "./service/invoice.service";

// Facturation (P6) : liée 1:1 à un cycle. Termes saisis dans le builder (DRAFT), émise à la
// diffusion du cycle, lue par l'athlète.
// AccountModule : résolution des noms coach/athlète (User est hors scope tenant).
// InvoiceService est exporté : PlanService l'appelle au publish pour émettre la facture.
// NotificationService (push) et ClsService (acteur courant) sont globaux — pas d'import ici.
@Module({
  imports: [AccountModule],
  controllers: [InvoiceController, PlanBillingController],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
