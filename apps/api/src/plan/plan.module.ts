import { Module } from "@nestjs/common";
import { AccessModule } from "../access/access.module";
import { CustomMetricModule } from "../custom-metric/custom-metric.module";
import { ExerciseModule } from "../exercise/exercise.module";
import { StorageModule } from "../infra/storage/storage.module";
import { InvoiceModule } from "../invoice/invoice.module";
import { ReminderModule } from "../reminder/reminder.module";
import { AthletePlanController } from "./controller/athlete-plan.controller";
import { PlanController } from "./controller/plan.controller";
import { PlanWeekController } from "./controller/plan-week.controller";
import { ScheduledSessionController } from "./controller/scheduled-session.controller";
import { AthletePlanService } from "./service/athlete-plan.service";
import { PlanService } from "./service/plan.service";
import { PlanWeekCopyService } from "./service/plan-week-copy.service";
import { ScheduledSessionService } from "./service/scheduled-session.service";

// Planifications (P3) : cycles, semaines et séances planifiées (copies éditables des modèles).
// Écriture réservée au coach ; lecture athlète isolée dans AthletePlanService (filtre PUBLISHED).
// StorageModule : les documents copiés sont servis en URLs GET signées, comme en bibliothèque.
// ReminderModule : supprimer un cycle purge les rappels qui le visaient, dans la même transaction
// (leur référence est polymorphe, donc sans FK — rien en base ne les emporte).
// ExerciseModule : la garde des exercices cités (`loadAccessibleOrThrow`, #353) ; CustomMetricModule :
// les métriques recopiées, lues chez le propriétaire de l'exercice (piège n°9). AccessModule : ce
// que le Coach peut faire d'un cycle qu'on lui ouvre (#607).
@Module({
  imports: [
    StorageModule,
    InvoiceModule,
    ReminderModule,
    ExerciseModule,
    CustomMetricModule,
    AccessModule,
  ],
  controllers: [
    PlanController,
    PlanWeekController,
    ScheduledSessionController,
    AthletePlanController,
  ],
  providers: [PlanService, PlanWeekCopyService, ScheduledSessionService, AthletePlanService],
  // AthletePlanService est exporté pour le débrief (P4) : il porte la garde « séance de
  // l'athlète courant, dans un cycle PUBLISHED » — à ne pas réécrire ailleurs.
  exports: [PlanService, AthletePlanService],
})
export class PlanModule {}
