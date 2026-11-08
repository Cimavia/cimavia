import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";
import { webUrlOf } from "./web-url";

// Schemes de l'app mobile (Expo) — origines de confiance pour Better Auth (flux natif
// @better-auth/expo). Un scheme par variante de build (apps/mobile/app.config.ts) : les builds
// cohabitent sur un même appareil, chacun avec son identifiant natif et son scheme.
export const MOBILE_SCHEMES = ["cimavia://", "cimavia-dev://", "cimavia-preview://"];

/**
 * Origines navigateur autorisées (CORS + trustedOrigins) : l'API elle-même (BETTER_AUTH_URL),
 * l'app web que nomment les e-mails (WEB_URL), et les origines déclarées dans CORS_ORIGINS
 * (séparées par des virgules). Dédupliquées.
 *
 * `WEB_URL` y entre d'office depuis #270 : le lien de vérification d'adresse ramène sur
 * `${WEB_URL}/verify-email`, et Better Auth refuse en 403 tout `callbackURL` hors de ses origines
 * de confiance — AVANT de vérifier quoi que ce soit. Oubliée dans `CORS_ORIGINS`, elle aurait
 * rendu tout lien inutilisable, donc toute inscription sans issue, sans rien qui le dise au
 * démarrage. Seule son ORIGINE compte : un chemin dans `WEB_URL` ne doit pas l'en exclure.
 */
export function browserOrigins(config: ConfigService<EnvSchema, true>): string[] {
  const authUrl = config.get("BETTER_AUTH_URL", { infer: true });
  const webUrl = webUrlOf(config);
  const raw = config.get("CORS_ORIGINS", { infer: true });
  const extra = raw
    ? raw
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];
  const web = webUrl == null ? [] : [new URL(webUrl).origin];
  return [...new Set([authUrl, ...web, ...extra])];
}
