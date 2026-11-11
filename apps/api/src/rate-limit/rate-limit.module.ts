import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { RateLimitGuard } from "./rate-limit.guard";
import { rateLimitOptions } from "./rate-limit.policy";

/**
 * Limite le débit des routes métier par acteur (#782) — Better Auth ne limite que les siennes.
 *
 * Importé APRÈS `CapabilityModule`, pour la même raison que lui : les `APP_GUARD` tournent dans
 * l'ordre des modules, et la clé du compteur est l'utilisateur que l'AuthGuard pose. Avant lui,
 * tout le monde serait compté sur l'IP. Après la garde des capacités, un 403 ne coûte rien.
 *
 * Compteurs en mémoire : une seule instance tourne (RL-1 dans `docs/dette/comptes-et-tenancy.md`).
 */
@Module({
  imports: [ThrottlerModule.forRoot(rateLimitOptions())],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class RateLimitModule {}
