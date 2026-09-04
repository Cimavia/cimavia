import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Variantes d'app : chaque profil de build a son identifiant natif et son scheme propres, pour que
 * les builds cohabitent sur un même appareil (dev local + build interne + store) sans que l'OS les
 * confonde. Sans APP_VARIANT (expo start / expo run:*), on est en `development`.
 *
 * `slug` et `extra.eas.projectId` restent communs : un seul projet EAS, plusieurs app ids.
 */
const VARIANTS = {
  development: { idSuffix: ".dev", nameSuffix: " (dev)", scheme: "cimavia-dev" },
  preview: { idSuffix: ".preview", nameSuffix: " (preview)", scheme: "cimavia-preview" },
  production: { idSuffix: "", nameSuffix: "", scheme: "cimavia" },
} as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  // Le repli sur `production` est RÉSOLU ici plutôt qu'au moment de lire la table : la variante
  // retenue sert aussi à taguer les événements Sentry, et une valeur inconnue qui recevrait les
  // identifiants natifs de production tout en se taguant de son propre nom bidon décrirait un
  // build qui n'existe pas.
  const requested = process.env.APP_VARIANT ?? "development";
  const variant = (requested in VARIANTS ? requested : "production") as keyof typeof VARIANTS;
  const { idSuffix, nameSuffix, scheme } = VARIANTS[variant];

  // ConfigContext type `name`/`slug` comme optionnels ; app.json les fournit toujours. On échoue
  // fort plutôt que de replier sur une valeur par défaut, qui produirait un build mal identifié.
  const { name, slug } = config;
  if (!name || !slug) {
    throw new Error("app.json doit définir `name` et `slug`");
  }

  const appId = `fr.cimavia.app${idSuffix}`;

  return {
    ...config,
    name: `${name}${nameSuffix}`,
    slug,
    scheme,
    ios: { ...config.ios, bundleIdentifier: appId },
    android: { ...config.android, package: appId },
    /**
     * `extra` est ÉTENDU, jamais écrasé : il porte déjà `eas.projectId` et `router` (app.json), et
     * les perdre casse les builds EAS.
     *
     * `appVariant` y entre parce que c'est le seul chemin par lequel la variante atteint le code de
     * l'app : `APP_VARIANT` vit dans Node au moment du bundling, et Metro n'inline que les
     * variables `EXPO_PUBLIC_`. Relu par `shared/lib/sentry.ts` via `Constants.expoConfig.extra`.
     */
    extra: { ...config.extra, appVariant: variant },
  };
};
