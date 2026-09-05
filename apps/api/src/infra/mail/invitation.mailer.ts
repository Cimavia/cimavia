import type { EnvSchema } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mailCatalog } from "./mail.catalog";
import { MailService } from "./mail.service";

/**
 * L'e-mail d'invitation (#146) — le second canal d'une invitation nominative, et le seul qui
 * atteigne une adresse **sans compte**.
 *
 * C'est le cas le plus courant : on invite quelqu'un précisément parce qu'il n'est pas encore là.
 * Le centre de notifications ne peut rien pour lui, le push non plus — il n'a ni compte ni
 * application. Sans ce canal, saisir une adresse restait un geste sans effet, ce que #146 existe
 * pour corriger.
 *
 * **Il n'est pas soumis à l'opt-in** des notifications par e-mail (#65), et ce n'est pas un
 * oubli : cet opt-in est un réglage de compte, et le destinataire n'en a pas. Les trois types
 * `INVITATION_*` restent d'ailleurs hors de `EMAILABLE_NOTIFICATION_TYPES` — ils s'adressent, eux,
 * à des comptes existants.
 *
 * **La langue est le français**, faute de mieux : `mailStringsFor(null)` replie sur elle, et il n'y
 * a aucun `User.locale` à lire pour quelqu'un qui n'existe pas encore. C'est un écart assumé que
 * seule une invitation portant une langue pourrait fermer.
 *
 * Ne lève jamais, comme les deux autres mailers : `MailService.send` absorbe l'échec, et
 * l'appelant est la création d'invitation, qui a déjà réussi et commité.
 */
@Injectable()
export class InvitationMailer {
  private readonly registerUrl: string | null;

  constructor(
    private readonly mail: MailService,
    config: ConfigService<EnvSchema, true>,
  ) {
    const webUrl = config.get("WEB_URL", { infer: true });
    // Sans `WEB_URL`, le lien disparaît et le message part quand même : le CODE est le contenu,
    // le lien n'est qu'un raccourci. Même arbitrage que le pied de `NotificationMailer`.
    //
    // ⚠️ `/register` est la route d'inscription côté web (`apps/web/src/routes/register.tsx`).
    // Aucun test ne peut le vérifier — l'API ne connaît pas le routeur du client —, donc la
    // renommer casse ce lien EN SILENCE. La nommer ici est la seule parade : un `grep register.tsx`
    // la trouve.
    this.registerUrl = webUrl == null ? null : `${webUrl.replace(/\/+$/, "")}/register`;
  }

  async send(params: {
    to: string;
    coachName: string | null;
    code: string;
    expiresInDays: number;
  }): Promise<void> {
    const template = mailCatalog(null).invitation({
      coachName: params.coachName,
      code: params.code,
      expiresInDays: params.expiresInDays,
      registerUrl: this.registerUrl,
    });
    await this.mail.send({ to: params.to, ...template });
  }
}
