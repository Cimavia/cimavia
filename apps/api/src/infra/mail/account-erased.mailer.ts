import { Injectable } from "@nestjs/common";
import { mailCatalog } from "./mail.catalog";
import { MailService } from "./mail.service";

/**
 * Confirme une suppression de compte (#256). Le seul message envoyé à une adresse qu'on ne détient
 * plus : elle est passée en argument, lue juste avant l'effacement, et n'est gardée nulle part.
 */
@Injectable()
export class AccountErasedMailer {
  constructor(private readonly mail: MailService) {}

  /** Ne lève pas — `MailService.send` non plus : le compte est déjà parti, l'envoi n'y change rien. */
  async send(params: { to: string; locale: string | null }): Promise<void> {
    await this.mail.send({ to: params.to, ...mailCatalog(params.locale).accountErased() });
  }
}
