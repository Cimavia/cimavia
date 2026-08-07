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
  const variant = (process.env.APP_VARIANT ?? "development") as keyof typeof VARIANTS;
  const { idSuffix, nameSuffix, scheme } = VARIANTS[variant] ?? VARIANTS.production;

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
  };
};
