import { Module } from "@nestjs/common";
import { ReminderController } from "./controller/reminder.controller";
import { ReminderTickController } from "./controller/reminder-tick.controller";
import { ReminderService } from "./service/reminder.service";
import { ReminderTickService } from "./service/reminder-tick.service";

/**
 * Rappels (#44) — outil privé du coach, création manuelle.
 *
 * `ReminderService` est exporté pour deux appelants hors module, et aucun autre :
 * - `PlanService`, qui purge les rappels d'un cycle supprimé dans SA transaction ;
 * - le centre de notifications (#51), qui fait remonter les rappels dus.
 *
 * Aucun import : les cycles et les factures sont lus par des requêtes scopées sur `TENANT_PRISMA`,
 * pas via `PlanService`/`InvoiceService` — ce qui évite un cycle de modules avec `PlanModule`, qui
 * dépend de celui-ci.
 */
@Module({
  // `ReminderTickController` est à part de `ReminderController` : celui-ci porte la capacité coach
  // au niveau classe, le tick n'a aucun acteur (cf. son en-tête).
  controllers: [ReminderController, ReminderTickController],
  providers: [ReminderService, ReminderTickService],
  exports: [ReminderService],
})
export class ReminderModule {}
