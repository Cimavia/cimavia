import { Module } from "@nestjs/common";
import { MailService } from "./mail.service";

// Infra transverse : envoi d'e-mails transactionnels (cf. architecture-choice §2 infra/).
// Même contrat que StorageModule — un fournisseur SMTP se remplace par des variables d'env.
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
