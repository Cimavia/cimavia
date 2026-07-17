import type { PushTokenDto, RegisterPushTokenInput } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PushToken } from "@prisma/client";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";

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
  ) {}

  /**
   * Enregistre l'appareil courant. Idempotent : l'app réenregistre son token à chaque démarrage
   * (Expo peut le faire tourner). `upsert` Prisma étant interdit par le client tenant, la
   * bascule est faite à la main.
   *
   * ⚠️ Le token est UNIQUE en base, et un appareil change de main : se déconnecter pour se
   * reconnecter avec un autre compte (le cas du dev qui teste coach et athlète sur le même
   * téléphone) réenregistre le MÊME token pour un autre utilisateur. Le scope tenant rendant
   * l'ancienne ligne invisible, on la détacherait sans le savoir → violation d'unicité en 500.
   * D'où le passage par le client de base pour la détacher : le dernier appareil à s'annoncer
   * gagne. Contrepartie assumée : quelqu'un qui connaîtrait le token d'un tiers pourrait le lui
   * voler et le priver de ses notifications (pas d'accès à ses données — seule la livraison
   * bascule). Le vrai correctif serait une preuve de possession de l'appareil, hors MVP.
   */
  async register(input: RegisterPushTokenInput): Promise<PushTokenDto> {
    const existing = await this.db.pushToken.findFirst({ where: { token: input.token } });
    if (existing != null) {
      const updated = await this.db.pushToken.update({
        where: { id: existing.id },
        data: { platform: input.platform },
      });
      return toPushTokenDto(updated);
    }

    await this.prisma.pushToken.deleteMany({ where: { token: input.token } });

    // userId injecté par le tenancy layer — d'où le cast final.
    const data: Omit<Prisma.PushTokenUncheckedCreateInput, "userId"> = {
      token: input.token,
      platform: input.platform,
    };
    const created = await this.db.pushToken.create({
      data: data as Prisma.PushTokenUncheckedCreateInput,
    });
    return toPushTokenDto(created);
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

function toPushTokenDto(row: PushToken): PushTokenDto {
  return {
    id: row.id,
    token: row.token,
    platform: row.platform,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
