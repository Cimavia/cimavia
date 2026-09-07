import { randomBytes } from "node:crypto";
import {
  PUSH_INSTALLATION_SECRET_BYTES,
  type PushTokenDto,
  type RegisterPushTokenInput,
} from "@cmv/shared";
import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PushToken } from "@prisma/client";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { constantTimeEquals, hashSecret } from "../../util/crypto.util";

/**
 * Appareils d'un utilisateur pour les notifications push.
 *
 * Le token adresse une INSTALLATION, pas une personne : chacun peut en avoir plusieurs, et un
 * token change (réinstallation, restauration de sauvegarde). Il est donc unique en base et se
 * réenregistre sans doublon.
 *
 * Scopé `userId` pour les deux rôles (TENANT_SCOPES) : chacun ne gère que SES appareils. La
 * lecture pour ENVOYER, elle, vise un autre tenant → NotificationService, client non scopé.
 */
@Injectable()
export class PushTokenService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    // Client NON scopé, pour un seul geste : détacher un token de son ancien propriétaire.
    private readonly prisma: PrismaService,
    @InjectPinoLogger(PushTokenService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Enregistre l'appareil courant. Idempotent : l'app réenregistre son token à chaque démarrage
   * (Expo peut le faire tourner). `upsert` Prisma étant interdit par le client tenant, la
   * bascule est faite à la main.
   *
   * Le token est UNIQUE en base, et un appareil change de main : se déconnecter pour se
   * reconnecter avec un autre compte (le cas du dev qui teste coach et athlète sur le même
   * téléphone) réenregistre le MÊME token pour un autre utilisateur. Réaffecter est donc
   * nécessaire, pas accidentel.
   *
   * Ce qui a changé en #90 (dette P4-3) : la réaffectation n'est plus accordée à qui connaît
   * l'adresse, mais à qui prouve être **la même installation**. Le token est une adresse de
   * livraison, publique par nature ; le SECRET d'installation, lui, ne sort jamais de
   * `expo-secure-store`. Sans lui, quiconque connaissait un token pouvait priver son
   * propriétaire de ses notifications.
   *
   * Trois chemins, et un seul refuse :
   *
   * - **La ligne est à moi** → `refresh`. Ma session le prouve déjà : le secret n'y sert qu'à
   *   savoir s'il faut en réémettre un.
   * - **Personne ne la tient, ou elle n'a pas de secret** → création / adoption, avec émission.
   * - **Un autre la tient, scellée** → il faut présenter le secret, sinon 403.
   */
  async register(input: RegisterPushTokenInput): Promise<PushTokenDto> {
    const mine = await this.db.pushToken.findFirst({ where: { token: input.token } });
    return mine == null ? this.claim(input) : this.refresh(mine, input);
  }

  /**
   * Ré-enregistrement par le propriétaire — le cas de chaque démarrage de l'app.
   *
   * On réémet un secret dès que le client n'a pas celui qu'on attend, et c'est volontaire : sa
   * session prouve que la ligne est à lui, le secret n'a rien à prouver ici. C'est le chemin de
   * reprise d'un `SecureStore` effacé, et celui qui scelle une ligne héritée d'avant #90 — sans
   * lui, un appareil ayant perdu son secret ne pourrait plus jamais être réaffecté.
   */
  private async refresh(mine: PushToken, input: RegisterPushTokenInput): Promise<PushTokenDto> {
    const issued = holdsSecret(input.installationSecret, mine.installationSecretHash)
      ? null
      : issueSecret();

    const updated = await this.db.pushToken.update({
      where: { id: mine.id },
      data:
        issued == null
          ? { platform: input.platform }
          : { platform: input.platform, installationSecretHash: hashSecret(issued) },
    });
    return toPushTokenDto(updated, issued);
  }

  /**
   * Le token n'est pas à MOI — le scope tenant vient de le dire. Il ne dit pas s'il existe : une
   * ligne appartenant à un autre compte est invisible d'ici, et la créer quand même violerait
   * l'unicité en 500. D'où la lecture par le client de base, bornée à ce seul constat.
   */
  private async claim(input: RegisterPushTokenInput): Promise<PushTokenDto> {
    const held = await this.prisma.pushToken.findUnique({ where: { token: input.token } });
    const { hash, issued } = await this.detachFrom(held, input);

    // userId injecté par le tenancy layer — d'où le cast final.
    const data: Omit<Prisma.PushTokenUncheckedCreateInput, "userId"> = {
      token: input.token,
      platform: input.platform,
      installationSecretHash: hash,
    };
    const created = await this.db.pushToken.create({
      data: data as Prisma.PushTokenUncheckedCreateInput,
    });
    return toPushTokenDto(created, issued);
  }

  /**
   * Libère l'adresse au profit du compte courant, et dit avec quel secret la nouvelle ligne
   * repart — celui qu'on vient d'émettre, ou celui que la ligne portait déjà.
   */
  private async detachFrom(
    held: PushToken | null,
    input: RegisterPushTokenInput,
  ): Promise<{ hash: string; issued: string | null }> {
    // Personne ne tient l'adresse : premier enregistrement de cette installation.
    if (held == null) {
      const issued = issueSecret();
      return { hash: hashSecret(issued), issued };
    }

    // Ligne héritée d'avant #90 : personne ne peut rien prouver dessus, et la refuser
    // condamnerait un appareil légitime. On adopte, en scellant du même geste — chaque appareil
    // ferme sa propre fenêtre à sa première ouverture de l'app à jour.
    if (held.installationSecretHash == null) {
      const issued = issueSecret();
      await this.prisma.pushToken.delete({ where: { id: held.id } });
      return { hash: hashSecret(issued), issued };
    }

    // L'appareil change de main : le compte est neuf, l'installation est la même. Le secret
    // survit à la bascule — le client le détient déjà, rien à lui réémettre.
    if (holdsSecret(input.installationSecret, held.installationSecretHash)) {
      await this.prisma.pushToken.delete({ where: { id: held.id } });
      return { hash: held.installationSecretHash, issued: null };
    }

    // On journalise l'id de la ligne, jamais le token ni le secret présenté : c'est la tentative
    // qu'on veut voir passer dans Axiom, pas de quoi la rejouer.
    this.logger.warn(
      { event: "push.token.takeover_refused", tokenId: held.id },
      "Réaffectation d'un appareil push refusée faute de secret d'installation",
    );
    throw new ForbiddenException("Cet appareil est enregistré par un autre compte");
  }

  /**
   * Révoque l'appareil courant (déconnexion). Silencieux si le token est inconnu ou appartient
   * à quelqu'un d'autre : le scope tenant filtre déjà, et une déconnexion n'a pas à échouer
   * parce qu'un token avait déjà été purgé (par `DeviceNotRegistered`, par exemple).
   */
  async revoke(token: string): Promise<void> {
    await this.db.pushToken.deleteMany({ where: { token } });
  }
}

/** Secret d'installation neuf. Base64url, comme les codes d'invitation — jamais stocké en clair. */
function issueSecret(): string {
  return randomBytes(PUSH_INSTALLATION_SECRET_BYTES).toString("base64url");
}

/**
 * Le client présente-t-il le secret que porte cette ligne ? Absence de l'un OU de l'autre = non,
 * jamais un laissez-passer : une ligne sans empreinte se traite ailleurs, à un endroit qui le dit.
 */
function holdsSecret(provided: string | undefined, expectedHash: string | null): boolean {
  if (provided == null || expectedHash == null) return false;
  return constantTimeEquals(hashSecret(provided), expectedHash);
}

function toPushTokenDto(row: PushToken, issuedSecret: string | null = null): PushTokenDto {
  return {
    id: row.id,
    token: row.token,
    platform: row.platform,
    // `null` tant que rien n'est émis : le client garde le secret qu'il détient déjà.
    installationSecret: issuedSecret,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
