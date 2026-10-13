import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module";
import { CoachOrganizationController } from "./controller/coach-organization.controller";
import { AccessService } from "./service/access.service";
import { AccessGrantService } from "./service/access-grant.service";

// Les droits d'accès de la bibliothèque (#605) : ce que l'acteur peut faire d'un élément qu'il lit.
// AccountModule pour les noms (`User` hors scope). Exporté : exercices et séances en dépendent.
@Module({
  imports: [AccountModule],
  controllers: [CoachOrganizationController],
  providers: [AccessService, AccessGrantService],
  exports: [AccessService, AccessGrantService],
})
export class AccessModule {}
