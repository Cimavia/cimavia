import { Module } from "@nestjs/common";
import { MailModule } from "../infra/mail/mail.module";
import { AthleteSheetController } from "./controller/athlete-sheet.controller";
import { CapabilityController } from "./controller/capability.controller";
import { InvitationController } from "./controller/invitation.controller";
import { RelationController } from "./controller/relation.controller";
import { AthleteSheetService } from "./service/athlete-sheet.service";
import { CapabilityService } from "./service/capability.service";
import { CounterpartService } from "./service/counterpart.service";
import { InvitationService } from "./service/invitation.service";
import { RelationService } from "./service/relation.service";
import { UserDirectoryService } from "./service/user-directory.service";

// Comptes, rôles, relation coach↔athlète et fiche athlète (cf. architecture-choice §2).
@Module({
  // MailModule : le second canal d'une invitation nominative (#146), pour une adresse qui n'a pas
  // encore de compte. Importé et non global — l'envoi d'e-mails n'a pas à être visible partout.
  imports: [MailModule],
  controllers: [
    InvitationController,
    RelationController,
    AthleteSheetController,
    CapabilityController,
  ],
  providers: [
    InvitationService,
    RelationService,
    AthleteSheetService,
    CapabilityService,
    CounterpartService,
    UserDirectoryService,
  ],
  // Exporté pour la liste des débriefs (P4) : elle nomme l'athlète, et le nom ne vit que sur
  // `User` — table hors scope tenant, lue par ce seul service.
  exports: [UserDirectoryService],
})
export class AccountModule {}
