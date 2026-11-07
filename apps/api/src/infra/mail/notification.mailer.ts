import type { EmailableNotificationType, EnvSchema } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mailCatalog } from "./mail.catalog";
import { MailService } from "./mail.service";
import { webPage } from "./web-page";

export type NotificationMailRecipient = {
  email: string;
  /** `User.locale` — un `String` en base, pas un enum Prisma : le catalogue replie sur le français. */
  locale: string | null;
};

/**
 * E-mail d'une notification métier (#65) — le troisième canal, à côté du push et du centre.
 *
 * Comme `PasswordResetMailer`, il vit dans `infra/mail/` avec le catalogue qui porte ses gabarits,
 * et il ne lève jamais : `MailService.send` absorbe déjà l'échec, et l'appelant est
 * `NotificationService`, dont la règle 2 veut qu'aucun canal ne fasse échouer l'action métier.
 */
@Injectable()
export class NotificationMailer {
  private readonly settingsUrl: string | null;

  constructor(
    private readonly mail: MailService,
    config: ConfigService<EnvSchema, true>,
  ) {
    // Sans `WEB_URL`, le pied disparaît et le message part quand même : un e-mail sans porte de
    // sortie reste préférable à pas d'e-mail. C'est un réglage de production, pas un prérequis.
    //
    // ⚠️ `apps/web/src/routes/account.tsx`, où vivent les réglages de notification — voir
    // `webPage` (dette I-2).
    this.settingsUrl = webPage(config, "/account");
  }

  async send(
    type: EmailableNotificationType,
    recipient: NotificationMailRecipient,
    params: { actorName: string | null; subjectLabel: string | null },
  ): Promise<void> {
    const template = mailCatalog(recipient.locale).notification(type, {
      ...params,
      settingsUrl: this.settingsUrl,
    });
    await this.mail.send({ to: recipient.email, ...template });
  }
}
