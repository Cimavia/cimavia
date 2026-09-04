import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { NotificationMailer } from "./notification.mailer";
import { PasswordResetMailer } from "./password-reset.mailer";

// Infra transverse : envoi d'e-mails transactionnels (cf. architecture-choice §2 infra/).
// Même contrat que StorageModule — un fournisseur SMTP se remplace par des variables d'env.
@Module({
  providers: [MailService, PasswordResetMailer, NotificationMailer],
  exports: [MailService, PasswordResetMailer, NotificationMailer],
})
export class MailModule {}
