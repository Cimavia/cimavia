import { type AppTier, formatAppVersion } from "@cmv/shared";
import Constants from "expo-constants";

/**
 * Ce que le pied de l'écran de profil affiche (#187).
 *
 * La version vient d'`expo-constants` et non d'une variable injectée : `app.json` la porte déjà, et
 * `release-please` la tient alignée sur la racine (#186). C'est la seule des trois couches qui
 * n'ait RIEN à injecter au build.
 *
 * Le tier vient d'`extra.appVariant`, posé par `app.config.ts`, et surtout pas d'un `APP_ENV` qui
 * n'existe pas ici : `APP_VARIANT` vit dans Node au moment du bundling, et Metro n'inline que les
 * variables `EXPO_PUBLIC_`. La raison complète est dans `sentry.ts`, qui lit la même valeur au même
 * endroit — deux lectures, une seule source.
 *
 * Le NUMÉRO NU est exposé à part parce qu'il a un second lecteur, qui n'affiche rien : le `buster`
 * du cache persisté (`query.tsx`, dette M-6). Lui donner le libellé suffixé y mêlerait de la
 * présentation à une identité de schéma.
 */
export function currentAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

export function appVersionLabel(): string | null {
  const tier = (Constants.expoConfig?.extra?.appVariant as AppTier | undefined) ?? "development";

  return formatAppVersion(currentAppVersion(), tier);
}
