import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));

/**
 * `sentry.ts` n'exporte rien : tout se joue à son ÉVALUATION. On le réimporte donc à chaque cas,
 * après avoir reposé l'environnement — sans `resetModules`, le cache de modules rejouerait le
 * premier import et les cas suivants passeraient sans rien exécuter.
 */
async function loadSentry(dsn: string | undefined, appVariant?: string) {
  vi.resetModules();
  vi.mocked(Sentry.init).mockClear();
  if (dsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
  Constants.expoConfig = { extra: appVariant === undefined ? {} : { appVariant } } as never;

  await import("./sentry");

  const [options] = vi.mocked(Sentry.init).mock.lastCall ?? [];
  if (!options) throw new Error("sentry.ts n'a pas appelé Sentry.init");
  return options;
}

const DSN = "https://clef@o0.ingest.de.sentry.io/1";

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

describe("sentry (mobile)", () => {
  it("laisse le SDK inerte quand aucun DSN n'est configuré", async () => {
    // Le cas du poste de développement, et celui d'un profil EAS dont le DSN n'est pas rempli :
    // l'app doit démarrer exactement pareil.
    expect(await loadSentry(undefined)).toMatchObject({ enabled: false, dsn: undefined });
  });

  it("arme le SDK quand un DSN est configuré", async () => {
    expect(await loadSentry(DSN)).toMatchObject({ enabled: true, dsn: DSN });
  });

  it("tague la variante de build, lue par expo-constants", async () => {
    // Le seul chemin par lequel APP_VARIANT atteint le code : Metro n'inline que les variables
    // `EXPO_PUBLIC_`, un `process.env.APP_VARIANT` ici rendrait `undefined`.
    expect(await loadSentry(DSN, "production")).toMatchObject({ environment: "production" });
  });

  it("retombe sur `development` quand la variante n'a pas été exposée", async () => {
    // Ce repli est un filet, pas un fonctionnement normal : y arriver en production signifie que
    // `extra.appVariant` a été perdu dans `app.config.ts`.
    expect(await loadSentry(DSN)).toMatchObject({ environment: "development" });
  });

  it("n'envoie ni IP ni en-têtes, et aucune trace de performance", async () => {
    expect(await loadSentry(DSN)).toMatchObject({ sendDefaultPii: false, tracesSampleRate: 0 });
  });
});
