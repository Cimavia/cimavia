import { EMAIL_VERIFICATION_TOKEN_TTL_HOURS, type EnvSchema } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mailCatalog } from "./mail.catalog";
import { MailService } from "./mail.service";
import { webPage } from "./web-page";

/**
 * Les e-mails de l'inscription vérifiée (#270) : le lien qui prouve que l'inscrit possède son
 * adresse, et l'avis au propriétaire d'une adresse déjà inscrite — confirmée ou non.
 *
 * Réunis parce qu'ils répondent au même appel — `POST /sign-up/email` part vers l'un ou l'autre
 * selon que l'adresse a déjà un compte, sans que la réponse HTTP le dise jamais. Même raison d'être
 * que `PasswordResetMailer` : `auth.config.ts` ne connaît ni Nest ni SMTP, il reçoit des callbacks.
 *
 * Ne lève jamais : `MailService.send` absorbe l'échec. Un envoi impossible ne doit ni transformer
 * une inscription en 500, ni distinguer par sa réponse une adresse neuve d'une adresse inscrite.
 */
@Injectable()
export class EmailVerificationMailer {
  /** Où le lien ramène une fois l'adresse vérifiée. `null` sans `WEB_URL`. */
  private readonly verifiedUrl: string | null;
  private readonly loginUrl: string | null;
  private readonly forgotPasswordUrl: string | null;

  constructor(
    private readonly mail: MailService,
    config: ConfigService<EnvSchema, true>,
  ) {
    // ⚠️ `apps/web/src/routes/verify-email.tsx`, `login.tsx`, `forgot-password.tsx` — voir
    // `webPage` (dette I-2).
    this.verifiedUrl = webPage(config, "/verify-email");
    this.loginUrl = webPage(config, "/login");
    this.forgotPasswordUrl = webPage(config, "/forgot-password");
  }

  /**
   * `url` est le lien que Better Auth a construit : `<api>/verify-email?token=…&callbackURL=…`.
   * Son `callbackURL` est celui qu'a envoyé le client, `/` par défaut — une page de l'API, où
   * l'inscrit ne trouverait rien. L'API le remplace par la page web qui dit « adresse vérifiée » :
   * c'est elle qui décide où mènent ses liens, comme pour l'invitation, et un client — l'APK d'hier
   * compris — n'a rien à envoyer pour que le lien soit juste.
   *
   * Sans `WEB_URL`, le lien reste celui de Better Auth : il vérifie l'adresse quand même, seule la
   * page d'arrivée manque.
   */
  async sendVerification(params: {
    to: string;
    locale: string | null;
    url: string;
  }): Promise<void> {
    const template = mailCatalog(params.locale).verifyEmail({
      url: this.withVerifiedPage(params.url),
      expiresInHours: EMAIL_VERIFICATION_TOKEN_TTL_HOURS,
    });
    await this.mail.send({ to: params.to, ...template });
  }

  /**
   * L'avis au propriétaire : c'est lui seul qui apprend qu'une inscription a visé son adresse.
   *
   * `verified: false` — le compte n'avait jamais été confirmé, et son mot de passe vient d'être
   * effacé (`auth.config.ts`) : l'avis mène au choix d'un mot de passe, pas à la connexion.
   */
  async sendExistingAccount(params: {
    to: string;
    locale: string | null;
    verified: boolean;
  }): Promise<void> {
    const catalog = mailCatalog(params.locale);
    const template = params.verified
      ? catalog.existingAccount({ loginUrl: this.loginUrl })
      : catalog.pendingAccount({ forgotPasswordUrl: this.forgotPasswordUrl });
    await this.mail.send({ to: params.to, ...template });
  }

  private withVerifiedPage(url: string): string {
    if (this.verifiedUrl == null) return url;
    const link = new URL(url);
    link.searchParams.set("callbackURL", this.verifiedUrl);
    return link.toString();
  }
}
