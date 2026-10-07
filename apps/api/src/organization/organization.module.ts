import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module";
import { MailModule } from "../infra/mail/mail.module";
import { OrganizationController } from "./controller/organization.controller";
import { OrganizationInvitationController } from "./controller/organization-invitation.controller";
import { OrganizationService } from "./service/organization.service";
import { OrganizationInvitationService } from "./service/organization-invitation.service";

// L'entreprise et ses Coachs (#601). AccountModule pour les noms et adresses (`User` hors scope),
// MailModule pour l'invitation d'une adresse sans compte.
@Module({
  imports: [AccountModule, MailModule],
  controllers: [OrganizationController, OrganizationInvitationController],
  providers: [OrganizationService, OrganizationInvitationService],
})
export class OrganizationModule {}
