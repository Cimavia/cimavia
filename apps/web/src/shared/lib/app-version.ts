import { type AppTier, formatAppVersion } from "@cmv/shared";

/**
 * Ce que le pied de l'écran de compte affiche (#187).
 *
 * Lu À L'APPEL et non au chargement du module : `import.meta.env` est figé dans le bundle au
 * build, mais un test qui veut éprouver un autre tier passe par `vi.stubEnv`, qui n'a plus d'effet
 * sur une valeur déjà capturée au niveau du module.
 *
 * Le défaut `development` sur le tier est le MÊME que celui d'`instrument.ts` et du schéma
 * `@cmv/shared` : il n'invente rien, il répète une valeur déjà décidée ailleurs. La VERSION, elle,
 * n'a aucun défaut — c'est le sujet de la règle dure n°5.
 */
export function appVersionLabel(): string | null {
  const version = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? null;
  const tier = ((import.meta.env.VITE_APP_ENV as string | undefined) || "development") as AppTier;

  return formatAppVersion(version, tier);
}
