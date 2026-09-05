import { Module } from "@nestjs/common";
import { InvitationMailer } from "./invitation.mailer";
import { MailService } from "./mail.service";
import { NotificationMailer } from "./notification.mailer";
import { PasswordResetMailer } from "./password-reset.mailer";

// Infra transverse : envoi d'e-mails transactionnels (cf. architecture-choice §2 infra/).
// Même contrat que StorageModule — un fournisseur SMTP se remplace par des variables d'env.
@Module({
  providers: [MailService, PasswordResetMailer, NotificationMailer, InvitationMailer],
  exports: [MailService, PasswordResetMailer, NotificationMailer, InvitationMailer],
})
export class MailModule {}
