import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CapabilitiesGuard } from "./guard/capabilities.guard";

/**
 * Monte `CapabilitiesGuard` en garde globale — dans un module, et pas dans les `providers` de
 * `AppModule`, pour une raison mesurée et non supposée (#10).
 *
 * Les `APP_GUARD` s'exécutent dans l'ordre où leurs providers sont enregistrés, et ceux du module
 * RACINE passent **avant** ceux des modules importés. Déclarée dans `AppModule`, cette garde
 * tournait donc avant l'AuthGuard de `@thallesp/nestjs-better-auth` — donc avant que
 * `request.user` existe. Les 230 e2e l'ont dit d'un coup, parce que la garde lève au lieu
 * d'ouvrir quand l'utilisateur manque.
 *
 * Ce module est importé APRÈS `BetterAuthModule` dans `AppModule` : c'est cet ordre-là qui place la
 * garde après l'authentification. Le déplacer plus haut dans la liste des imports la casse — d'où
 * ce fichier, dont c'est toute la raison d'être.
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: CapabilitiesGuard }],
})
export class CapabilityModule {}
