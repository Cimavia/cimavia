import { Module } from "@nestjs/common";
import { EmailVerificationMailer } from "./email-verification.mailer";
import { InvitationMailer } from "./invitation.mailer";
import { MailService } from "./mail.service";
import { NotificationMailer } from "./notification.mailer";
import { PasswordResetMailer } from "./password-reset.mailer";

// Infra transverse : envoi d'e-mails transactionnels (cf. architecture-choice §2 infra/).
// Même contrat que StorageModule — un fournisseur SMTP se remplace par des variables d'env.
@Module({
  providers: [
    MailService,
    PasswordResetMailer,
    EmailVerificationMailer,
    NotificationMailer,
    InvitationMailer,
  ],
  exports: [
    MailService,
    PasswordResetMailer,
    EmailVerificationMailer,
    NotificationMailer,
    InvitationMailer,
  ],
})
export class MailModule {}
