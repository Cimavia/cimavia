import type { EnvSchema } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { createTransport, type Transporter } from "nodemailer";

/**
 * Port SMTPS implicite : la connexion est chiffrée AVANT le dialogue SMTP. Partout ailleurs
 * (587 en production, 1025 sur Mailpit) elle s'ouvre en clair puis monte en TLS par STARTTLS —
 * forcer `secure` sur ces ports-là fait échouer la poignée de main, sans message exploitable.
 */
const SMTPS_PORT = 465;

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  from: string;
  auth: { user: string; pass: string } | null;
};

/**
 * Envoi d'e-mails transactionnels, abstrait derrière des variables d'environnement — même
 * portabilité que `StorageService` : Mailpit en dev local, Scaleway TEM ou Brevo en production,
 * sans que le code change (CDC §7.5).
 *
 * Une différence de contrat avec `StorageService`, délibérée : **rien ne lève ici**. Un e-mail est
 * un effet de bord, pas une transaction — la règle 2 de `NotificationService` appliquée un cran
 * plus tôt. Le 503 du storage protège un flux dont le client attend le résultat ; ici, lever
 * transformerait une demande de réinitialisation réussie en 500, et la réponse trahirait
 * l'EXISTENCE du compte, que les deux écrans « mot de passe oublié » s'appliquent justement à
 * taire. L'appelant reçoit un booléen : il sait ce qui s'est passé, il n'est pas forcé d'en tenir
 * compte.
 */
@Injectable()
export class MailService {
  private readonly transporter: Transporter | null;
  private readonly from: string | null;

  constructor(
    @InjectPinoLogger(MailService.name) private readonly logger: PinoLogger,
    config: ConfigService<EnvSchema, true>,
  ) {
    const smtp = this.readConfig(config);
    if (smtp == null) {
      this.transporter = null;
      this.from = null;
      return;
    }
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === SMTPS_PORT,
      ...(smtp.auth != null && { auth: smtp.auth }),
    });
    this.from = smtp.from;
  }

  /**
   * Hôte, port et expéditeur suffisent : c'est le minimum pour ouvrir une connexion et adresser
   * un message. Les identifiants sont lus à part parce que Mailpit n'en demande aucun.
   *
   * Un identifiant SANS mot de passe (ou l'inverse) reste une erreur de déploiement : on
   * n'authentifie pas à moitié. On envoie alors sans auth — le serveur refusera franchement — et
   * on le DIT au boot, plutôt que de laisser chercher une panne réseau.
   */
  private readConfig(config: ConfigService<EnvSchema, true>): SmtpConfig | null {
    const host = config.get("SMTP_HOST", { infer: true });
    const port = config.get("SMTP_PORT", { infer: true });
    const from = config.get("MAIL_FROM", { infer: true });
    if (!host || port == null || !from) {
      return null;
    }
    const user = config.get("SMTP_USER", { infer: true });
    const pass = config.get("SMTP_PASSWORD", { infer: true });
    if (Boolean(user) !== Boolean(pass)) {
      this.logger.warn(
        "SMTP_USER et SMTP_PASSWORD vont ensemble : l'un sans l'autre, la connexion partira sans authentification",
      );
    }
    return { host, port, from, auth: user && pass ? { user, pass } : null };
  }

  get isConfigured(): boolean {
    return this.transporter != null;
  }

  /**
   * Envoie un message. Ne lève jamais — voir le contrat de la classe.
   *
   * L'adresse du destinataire n'entre PAS dans les logs (Pino → Axiom) : c'est une donnée
   * personnelle, et le produit vise l'hébergement HDS en v1.0. Le domaine seul y va, parce qu'il
   * est ce qui se diagnostique vraiment à ce niveau — un fournisseur qui refuse nos envois — sans
   * identifier personne.
   */
  async send(message: MailMessage): Promise<boolean> {
    const domain = message.to.slice(message.to.lastIndexOf("@") + 1);
    if (this.transporter == null || this.from == null) {
      this.logger.warn(
        { domain, subject: message.subject },
        "E-mail non envoyé : SMTP non configuré (SMTP_HOST, SMTP_PORT et MAIL_FROM requis)",
      );
      return false;
    }
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
      this.logger.info({ domain, subject: message.subject }, "E-mail envoyé");
      return true;
    } catch (error) {
      this.logger.error(
        { err: error, domain, subject: message.subject },
        "Échec d'envoi de l'e-mail",
      );
      return false;
    }
  }
}
