import type { ConfigContext, ExpoConfig } from "expo/config";
import { type AndroidManifest, withAndroidManifest } from "expo/config-plugins";
// L'extension est REQUISE : le chargeur de config d'Expo ne résout pas un import TypeScript sans
// elle (« Cannot find module »), alors que Metro et Vitest s'en passent.
import { buildIosPermissionLocales } from "./shared/lib/ios-permission-locales.ts";
import en from "./shared/locale/en.json";
import fr from "./shared/locale/fr.json";

/**
 * Variantes d'app : chaque profil de build a son identifiant natif et son scheme propres, pour que
 * les builds cohabitent sur un même appareil (dev local + build interne + store) sans que l'OS les
 * confonde. Sans APP_VARIANT (expo start / expo run:*), on est en `development`.
 *
 * `slug` et `extra.eas.projectId` restent communs : un seul projet EAS, plusieurs app ids.
 *
 * `e2e` est la build que Maestro pilote (#638) : une release locale, jamais distribuée, qui vise
 * l'API de test. Son scheme n'est PAS dans les origines de confiance de l'API (`MOBILE_SCHEMES`) :
 * seule l'API de test le reçoit, par `CORS_ORIGINS`.
 */
const VARIANTS = {
  development: { idSuffix: ".dev", nameSuffix: " (dev)", scheme: "cimavia-dev" },
  preview: { idSuffix: ".preview", nameSuffix: " (preview)", scheme: "cimavia-preview" },
  e2e: { idSuffix: ".e2e", nameSuffix: " (e2e)", scheme: "cimavia-e2e" },
  production: { idSuffix: "", nameSuffix: "", scheme: "cimavia" },
} as const;

/**
 * Autorise le HTTP en clair. Le gabarit Expo ne le pose que dans les manifestes `debug` : une
 * release refuse `http://`, et la build e2e, qui vise une API de test sans TLS (le `localhost` de
 * l'appareil, relié par `adb reverse`), ne joindrait rien — une erreur réseau, sans un mot sur la
 * cause.
 */
export function allowCleartextTraffic(manifest: AndroidManifest): AndroidManifest {
  for (const application of manifest.manifest.application ?? []) {
    application.$["android:usesCleartextTraffic"] = "true";
  }
  return manifest;
}

/**
 * Ce qu'une build e2e retire ou ajoute à la config :
 * - **pas de mise à jour OTA** : l'empreinte de la build peut égaler celle d'un update publié pour
 *   la preview, qui la ferait viser l'API du NAS ;
 * - **pas de Firebase** : `google-services.json` ne connaît pas `fr.cimavia.app.e2e`, et Gradle
 *   refuserait la build. Le push n'est pas dans les parcours ;
 * - **le HTTP en clair** (`allowCleartextTraffic`).
 */
function forE2e(config: ExpoConfig): ExpoConfig {
  const { googleServicesFile: _firebase, ...android } = config.android ?? {};
  return withAndroidManifest(
    { ...config, android, updates: { ...config.updates, enabled: false } },
    (mod) => {
      mod.modResults = allowCleartextTraffic(mod.modResults);
      return mod;
    },
  );
}

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

  // Metro inline les URL au bundling, et le code se replie sur `localhost` sans rien dire quand
  // elles manquent (#255). Hors `development`, où ce repli est ce qui laisse un émulateur démarrer
  // sans `.env`, ce binaire s'installerait et ne joindrait jamais l'API. Ce fichier est aussi
  // évalué par `eas update` : la garde vaut pour un update comme pour un build (#287).
  if (variant !== "development") {
    const missing = ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_WEB_URL"].filter(
      (key) => !process.env[key],
    );
    if (missing.length > 0) {
      throw new Error(`La variante ${variant} exige ${missing.join(" et ")}`);
    }
  }

  const appId = `fr.cimavia.app${idSuffix}`;

  const resolved: ExpoConfig = {
    ...config,
    name: `${name}${nameSuffix}`,
    slug,
    scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: appId,
      /**
       * La langue de repli des demandes de permission (#254). Quand la langue du téléphone n'a pas
       * son `.lproj`, iOS prend celui de `CFBundleDevelopmentRegion` — pas le texte brut de
       * l'`Info.plist`. Le gabarit Expo la fixe à `en` : un téléphone en allemand lirait ses
       * permissions en anglais et l'app en français. Forcée au `fallbackLng` d'i18next (`fr`,
       * `shared/lib/i18n.ts`, #88) : les deux changent ensemble, et le binaire avec.
       */
      infoPlist: { ...config.ios?.infoPlist, CFBundleDevelopmentRegion: "fr" },
    },
    android: { ...config.android, package: appId },
    locales: buildIosPermissionLocales({ fr, en }),
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
  return variant === "e2e" ? forE2e(resolved) : resolved;
};
