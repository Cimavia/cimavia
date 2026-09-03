import * as Sentry from "@sentry/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => ({ init: vi.fn() }));

/**
 * `instrument.ts` n'exporte rien : tout se joue à son ÉVALUATION. On le réimporte donc à chaque
 * cas, après avoir reposé l'environnement — sans `resetModules`, le cache de modules rejouerait le
 * premier import et les cas suivants passeraient sans rien exécuter.
 */
async function loadInstrument() {
  vi.resetModules();
  vi.mocked(Sentry.init).mockClear();
  await import("./instrument");
  const [options] = vi.mocked(Sentry.init).mock.lastCall ?? [];
  if (!options) throw new Error("instrument.ts n'a pas appelé Sentry.init");
  return options;
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("instrument", () => {
  it("laisse le SDK inerte quand aucun DSN n'est configuré", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");

    const options = await loadInstrument();

    // `enabled: false` ET pas de DSN : c'est le cas du poste de développement, où l'on ne
    // configure rien et où l'app doit démarrer exactement pareil.
    expect(options).toMatchObject({ enabled: false, dsn: undefined });
  });

  it("arme le SDK quand un DSN est configuré", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://clef@o0.ingest.sentry.io/1");

    const options = await loadInstrument();

    expect(options).toMatchObject({
      enabled: true,
      dsn: "https://clef@o0.ingest.sentry.io/1",
    });
  });

  it("tague le tier de déploiement, pas le mode de build", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://clef@o0.ingest.sentry.io/1");
    vi.stubEnv("VITE_APP_ENV", "staging");

    expect(await loadInstrument()).toMatchObject({ environment: "staging" });
  });

  it("retombe sur `development` quand le tier n'est pas renseigné", async () => {
    vi.stubEnv("VITE_APP_ENV", "");

    // Le même défaut que le schéma de @cmv/shared : un événement non tagué serait pire qu'un
    // événement tagué dev, puisqu'il ne se filtrerait nulle part.
    expect(await loadInstrument()).toMatchObject({ environment: "development" });
  });

  it("n'envoie ni IP ni en-têtes, et aucune trace de performance", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://clef@o0.ingest.sentry.io/1");

    // Les deux décisions de #183 que rien d'autre ne retient : le front reste à `false` là où
    // l'API est à `true`, et le quota de performance ne se vide pas depuis un navigateur.
    expect(await loadInstrument()).toMatchObject({
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });
});
