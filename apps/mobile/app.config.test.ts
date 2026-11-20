import type { ConfigContext, ExpoConfig } from "expo/config";
import type { ExportedConfig } from "expo/config-plugins";
import { afterEach, describe, expect, it, vi } from "vitest";
import appConfig, { allowCleartextTraffic } from "./app.config";
import appJson from "./app.json";

const API_URL = "https://api-preview.cimavia.fr";
const WEB_URL = "https://app-preview.cimavia.fr";

function evaluate(env: Record<string, string | undefined>, fromAppJson: Partial<ExpoConfig> = {}) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return appConfig({
    config: { name: "cimavia", slug: "cimavia", ...fromAppJson },
  } as ConfigContext);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("app.config — garde des URL publiques", () => {
  it("laisse le développement se replier sur localhost", () => {
    // `expo start` et `expo export` locaux tournent sans APP_VARIANT ni `.env` : les bloquer
    // casserait l'émulateur et la porte qualité, qui n'ont rien à joindre.
    const config = evaluate({
      APP_VARIANT: undefined,
      EXPO_PUBLIC_API_URL: undefined,
      EXPO_PUBLIC_WEB_URL: undefined,
    });

    expect(config.extra?.appVariant).toBe("development");
  });

  it("refuse une variante preview sans url d'api", () => {
    expect(() =>
      evaluate({
        APP_VARIANT: "preview",
        EXPO_PUBLIC_API_URL: undefined,
        EXPO_PUBLIC_WEB_URL: WEB_URL,
      }),
    ).toThrow("La variante preview exige EXPO_PUBLIC_API_URL");
  });

  it("nomme les deux variables quand les deux manquent", () => {
    // Le cas réel du profil `production` tant que son URL n'existe pas (#255).
    expect(() =>
      evaluate({
        APP_VARIANT: "production",
        EXPO_PUBLIC_API_URL: undefined,
        EXPO_PUBLIC_WEB_URL: undefined,
      }),
    ).toThrow("La variante production exige EXPO_PUBLIC_API_URL et EXPO_PUBLIC_WEB_URL");
  });

  it("traite une valeur vide comme une valeur absente", () => {
    // Une variable déclarée mais vide dans l'environnement EAS inlinerait `""`, que `??` laisse
    // passer : le code partirait vers une URL relative, pas vers localhost, mais pas plus loin.
    expect(() =>
      evaluate({ APP_VARIANT: "preview", EXPO_PUBLIC_API_URL: "", EXPO_PUBLIC_WEB_URL: WEB_URL }),
    ).toThrow("EXPO_PUBLIC_API_URL");
  });

  it("laisse passer une variante qui déclare ses deux URL", () => {
    const config = evaluate({
      APP_VARIANT: "preview",
      EXPO_PUBLIC_API_URL: API_URL,
      EXPO_PUBLIC_WEB_URL: WEB_URL,
    });

    expect(config.ios?.bundleIdentifier).toBe("fr.cimavia.app.preview");
  });
});

describe("app.config — variante e2e (#638)", () => {
  const E2E = {
    APP_VARIANT: "e2e",
    EXPO_PUBLIC_API_URL: "http://10.0.2.2:3151",
    EXPO_PUBLIC_WEB_URL: "http://10.0.2.2:4360",
  };
  const fromAppJson: Partial<ExpoConfig> = {
    android: { googleServicesFile: "./google-services.json" },
    updates: { url: "https://u.expo.dev/projet" },
  };

  it("s'installe à côté des autres builds, sous son propre scheme", () => {
    const config = evaluate(E2E, fromAppJson);

    expect(config.android?.package).toBe("fr.cimavia.app.e2e");
    expect(config.scheme).toBe("cimavia-e2e");
    expect(config.extra?.appVariant).toBe("e2e");
  });

  it("exige l'url de l'api de test, comme toute build hors développement", () => {
    expect(() => evaluate({ ...E2E, EXPO_PUBLIC_API_URL: undefined })).toThrow(
      "La variante e2e exige EXPO_PUBLIC_API_URL",
    );
  });

  it("ne tire aucune mise à jour ota, sans perdre l'url du projet", () => {
    const config = evaluate(E2E, fromAppJson);

    expect(config.updates).toEqual({ url: "https://u.expo.dev/projet", enabled: false });
  });

  it("se construit sans firebase, qui ne connaît pas son identifiant", () => {
    const config = evaluate(E2E, fromAppJson);

    expect(config.android).not.toHaveProperty("googleServicesFile");
  });

  it("modifie le manifeste android, et seulement pour elle", () => {
    // `ExpoConfig` ne type pas `mods`, que les plugins posent au prebuild.
    const manifestMod = (config: ExpoConfig) => (config as ExportedConfig).mods?.android?.manifest;

    expect(manifestMod(evaluate(E2E, fromAppJson))).toBeTypeOf("function");
    expect(manifestMod(evaluate({ ...E2E, APP_VARIANT: "preview" }, fromAppJson))).toBeUndefined();
  });

  it("garde firebase et les mises à jour aux autres variantes", () => {
    const config = evaluate({ ...E2E, APP_VARIANT: "preview" }, fromAppJson);

    expect(config.android?.googleServicesFile).toBe("./google-services.json");
    expect(config.updates).toEqual({ url: "https://u.expo.dev/projet" });
  });
});

describe("allowCleartextTraffic", () => {
  it("autorise le http en clair sur l'application du manifeste", () => {
    const manifest = allowCleartextTraffic({
      manifest: {
        $: { "xmlns:android": "" },
        queries: [],
        application: [{ $: { "android:name": ".App" } }],
      },
    });

    expect(manifest.manifest.application?.[0]?.$).toEqual({
      "android:name": ".App",
      "android:usesCleartextTraffic": "true",
    });
  });

  it("laisse intact un manifeste sans application", () => {
    const manifest = { manifest: { $: { "xmlns:android": "" }, queries: [] } };

    expect(allowCleartextTraffic(manifest)).toEqual(manifest);
  });
});

describe("app.config — demandes de permission iOS", () => {
  it("traduit les permissions en français et en anglais", () => {
    const config = evaluate({ APP_VARIANT: undefined });

    expect(Object.keys(config.locales ?? {})).toEqual(["fr", "en"]);
  });

  it("replie une langue sans traduction sur le français, sans perdre l'Info.plist d'app.json", () => {
    const config = evaluate(
      { APP_VARIANT: undefined },
      { ios: { infoPlist: { UIFileSharingEnabled: true } } },
    );

    expect(config.ios?.infoPlist).toEqual({
      UIFileSharingEnabled: true,
      CFBundleDevelopmentRegion: "fr",
    });
  });
});

describe("app.json — note vocale écran verrouillé (#619)", () => {
  /**
   * `CmvAudioRecorder` demande `allowsBackgroundRecording` à chaque capture. Sans le service que ce
   * plugin déclare, Android refuse de lier l'enregistreur et TOUTE note échoue — un rouge que seul
   * un build complet montrerait. La lecture en arrière-plan reste coupée : rien ne joue app fermée,
   * et son service de premier plan serait à justifier au store sans usage.
   */
  it("déclare l'enregistrement en arrière-plan que demande le mode audio", () => {
    const audio = appJson.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-audio",
    );

    expect(audio?.[1]).toMatchObject({
      enableBackgroundRecording: true,
      enableBackgroundPlayback: false,
    });
  });
});
