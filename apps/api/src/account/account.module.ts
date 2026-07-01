import { Module } from "@nestjs/common";
import { AthleteSheetController } from "./controller/athlete-sheet.controller";
import { InvitationController } from "./controller/invitation.controller";
import { RelationController } from "./controller/relation.controller";
import { AthleteSheetService } from "./service/athlete-sheet.service";
import { InvitationService } from "./service/invitation.service";
import { RelationService } from "./service/relation.service";

// Comptes, rôles, relation coach↔athlète et fiche athlète (cf. architecture-choice §2).
@Module({
  controllers: [InvitationController, RelationController, AthleteSheetController],
  providers: [InvitationService, RelationService, AthleteSheetService],
})
export class AccountModule {}
