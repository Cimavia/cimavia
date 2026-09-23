import {
  type EnvSchema,
  InvitationStatus,
  isEmailAllowed,
  normalizeEmail,
  parseEmailList,
  type SignupMode,
} from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../infra/prisma/prisma.service";

/**
 * Qui a le droit de créer un compte sur CET environnement (#263).
 *
 * Preview (le NAS) est joignable publiquement et son URL n'a rien de secret : elle est figée dans
 * l'APK installé sur les téléphones et dans chaque e-mail qu'il envoie. Or ce tier porte de vraies
 * données depuis #260 — celles du Coach bêta et de ses Athletes. Tant que n'importe qui peut s'y
 * créer un compte, elles cohabitent avec des inconnus. Le refus est ce qui les en sépare.
 *
 * Trois façons d'entrer en mode `invitation`, et pas une de plus :
 *   - être sur la liste `SIGNUP_ALLOWED_EMAILS` — c'est la porte des COACHS, que personne n'invite ;
 *   - avoir une invitation NOMINATIVE en cours — c'est la porte des athlètes, ouverte par leur coach ;
 *   - rien d'autre.
 *
 * Un lien GÉNÉRIQUE (`email: null`) ne suffit délibérément pas : il n'identifie personne, donc il
 * ne peut rien autoriser avant l'inscription. Le coach qui veut faire entrer quelqu'un sur preview
 * l'invite par son adresse. Ce n'est pas une limite technique, c'est ce que « fermé » veut dire.
 *
 * Le contrôle vit ici plutôt que dans un contrôleur parce que l'inscription n'est pas notre route :
 * c'est Better Auth qui l'expose, et elle est appelée par le web, par le mobile et par le lien de
 * l'e-mail. Un seul point de refus, au plus près de la création.
 */
@Injectable()
export class SignupPolicy {
  private readonly mode: SignupMode;
  private readonly allowedEmails: string[];

  constructor(
    config: ConfigService<EnvSchema, true>,
    private readonly prisma: PrismaService,
  ) {
    // Lues une fois : ce sont des variables d'environnement, elles ne changent pas sous le process.
    // `SIGNUP_MODE` n'a pas de défaut dans le schéma — l'API a donc déjà refusé de démarrer si
    // l'environnement ne dit pas qui peut s'y inscrire.
    this.mode = config.get("SIGNUP_MODE", { infer: true });
    this.allowedEmails = parseEmailList(config.get("SIGNUP_ALLOWED_EMAILS", { infer: true }));
  }

  /**
   * L'ordre des trois questions est celui du COÛT : les deux premières se répondent en mémoire, la
   * troisième seule touche la base. Une inscription refusée en mode fermé ne doit pas offrir un
   * levier pour faire travailler la base à volonté.
   */
  async mayCreateAccount(email: string): Promise<boolean> {
    if (this.mode === "open") return true;
    if (isEmailAllowed(email, this.allowedEmails)) return true;

    // `count` et non `findFirst` : on ne veut rien savoir de l'invitation, seulement qu'il en
    // existe une. Les mêmes trois critères que `listForMe` — nominative, en cours, non expirée.
    const invitations = await this.prisma.invitation.count({
      where: {
        email: normalizeEmail(email),
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });
    return invitations > 0;
  }
}
