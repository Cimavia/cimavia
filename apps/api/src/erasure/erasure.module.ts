import { Module } from "@nestjs/common";
import { CustomMetricModule } from "../custom-metric/custom-metric.module";
import { ExerciseModule } from "../exercise/exercise.module";
import { MailModule } from "../infra/mail/mail.module";
import { StorageModule } from "../infra/storage/storage.module";
import { AccountErasureController } from "./controller/account-erasure.controller";
import { AccountErasureService } from "./service/account-erasure.service";
import { ErasureAttemptsService } from "./service/erasure-attempts.service";

// Supprimer son compte (#256). Un module à part : il dépend de la bibliothèque (copies figées), que
// `AccountModule` n'importe pas — et qui, elle, n'a pas à connaître l'effacement.
@Module({
  imports: [ExerciseModule, CustomMetricModule, StorageModule, MailModule],
  controllers: [AccountErasureController],
  providers: [AccountErasureService, ErasureAttemptsService],
})
export class ErasureModule {}
