import type { EnvSchema } from "@cmv/shared";
import type { ConfigService } from "@nestjs/config";

// Schemes de l'app mobile (Expo) — origines de confiance pour Better Auth (flux natif
// @better-auth/expo). Un scheme par variante de build (apps/mobile/app.config.ts) : les builds
// cohabitent sur un même appareil, chacun avec son identifiant natif et son scheme.
export const MOBILE_SCHEMES = ["cimavia://", "cimavia-dev://", "cimavia-preview://"];

/**
 * Origines navigateur autorisées (CORS + trustedOrigins) : l'API elle-même (BETTER_AUTH_URL)
 * + les origines déclarées dans CORS_ORIGINS (séparées par des virgules). Dédupliquées.
 */
export function browserOrigins(config: ConfigService<EnvSchema, true>): string[] {
  const authUrl = config.get("BETTER_AUTH_URL", { infer: true });
  const raw = config.get("CORS_ORIGINS", { infer: true });
  const extra = raw
    ? raw
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [];
  return [...new Set([authUrl, ...extra])];
}
