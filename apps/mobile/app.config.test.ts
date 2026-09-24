import type { ConfigContext } from "expo/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import appConfig from "./app.config";

const API_URL = "https://api-preview.cimavia.fr";
const WEB_URL = "https://app-preview.cimavia.fr";

function evaluate(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return appConfig({ config: { name: "cimavia", slug: "cimavia" } } as ConfigContext);
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
