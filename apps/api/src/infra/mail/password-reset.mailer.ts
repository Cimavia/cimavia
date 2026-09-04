import { RESET_PASSWORD_TOKEN_TTL_HOURS } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { mailCatalog } from "./mail.catalog";
import { MailService } from "./mail.service";

/**
 * Compose et envoie l'e-mail de réinitialisation de mot de passe.
 *
 * Une classe pour trois lignes, et c'est ce qui permet à `auth.config.ts` de ne connaître ni Nest
 * ni SMTP : Better Auth y est configuré par une fabrique pure, qui reçoit un callback. Toute la
 * plomberie injectable vit ici.
 *
 * Il vit dans `infra/mail/` avec le catalogue qui porte son gabarit, plutôt que dans `auth/` :
 * c'est le même objet que ce que #65 ajoutera pour les notifications par e-mail, et les séparer
 * aurait dispersé la même mécanique dans deux modules.
 */
@Injectable()
export class PasswordResetMailer {
  constructor(private readonly mail: MailService) {}

  /**
   * `locale` vient de `User.locale` et peut être n'importe quelle chaîne : le champ est un
   * `String` en base, pas un enum Prisma. Le catalogue replie donc sur le français plutôt que de
   * faire confiance à l'appelant.
   *
   * Ne lève pas — `MailService.send` non plus. Un envoi impossible ne doit pas transformer une
   * demande de réinitialisation réussie en 500, ni révéler par sa réponse que le compte existe.
   */
  async send(params: { to: string; locale: string | null; url: string }): Promise<void> {
    const template = mailCatalog(params.locale).resetPassword({
      url: params.url,
      expiresInHours: RESET_PASSWORD_TOKEN_TTL_HOURS,
    });
    await this.mail.send({ to: params.to, ...template });
  }
}
