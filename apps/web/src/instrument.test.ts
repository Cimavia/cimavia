import * as Sentry from "@sentry/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ce qui serait parti chez Sentry. Le transport est la SEULE pièce remplacée : le vrai `init` reçoit
 * les options d'`instrument.ts`, si bien que les intégrations par défaut, `beforeSend` et la
 * construction de l'enveloppe s'exécutent comme dans le navigateur. Lire l'option ne prouve rien —
 * c'est ainsi que « n'envoie ni IP ni en-têtes » a tenu alors que l'URL partait avec son jeton (#335).
 */
const sent: Sentry.Event[] = [];

vi.mock("@sentry/react", async (importOriginal) => {
  const real = await importOriginal<typeof import("@sentry/react")>();
  return {
    ...real,
    init: vi.fn((options: Sentry.BrowserOptions) =>
      real.init({
        ...options,
        transport: () => ({
          send: async ([, items]) => {
            for (const [header, payload] of items) {
              if (header.type === "event") sent.push(payload as Sentry.Event);
            }
            return {};
          },
          flush: async () => true,
        }),
      }),
    ),
  };
});

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
  sent.length = 0;
});

afterEach(async () => {
  await Sentry.close();
  window.history.replaceState(null, "", "/");
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
    vi.stubEnv("VITE_APP_ENV", "preview");

    expect(await loadInstrument()).toMatchObject({ environment: "preview" });
  });

  it("retombe sur `development` quand le tier n'est pas renseigné", async () => {
    vi.stubEnv("VITE_APP_ENV", "");

    // Le même défaut que le schéma de @cmv/shared : un événement non tagué serait pire qu'un
    // événement tagué dev, puisqu'il ne se filtrerait nulle part.
    expect(await loadInstrument()).toMatchObject({ environment: "development" });
  });

  it("désactive les traces de performance", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://clef@o0.ingest.sentry.io/1");

    // La décision de #183 que rien d'autre ne retient : le quota de performance ne se vide pas
    // depuis un navigateur.
    expect(await loadInstrument()).toMatchObject({ tracesSampleRate: 0 });
  });

  it("n'envoie ni l'IP, ni le jeton de réinitialisation que porte l'URL", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://clef@o0.ingest.sentry.io/1");
    await loadInstrument();

    // Après `init` : l'arrivée sur la page laisse alors un fil d'Ariane de navigation, jeton compris.
    window.history.replaceState(null, "", "/reset-password?token=jeton-secret");
    Sentry.captureException(new Error("boom"));
    await Sentry.flush(1000);

    const [event] = sent;
    expect(sent).toHaveLength(1);
    // Le jeton n'est NULLE PART — URL, Referer, fils d'Ariane ou champ qu'une version du SDK
    // ajouterait demain.
    expect(JSON.stringify(event)).not.toContain("jeton-secret");
    // Blanchi, pas retiré : l'événement dit encore sur quelle page il est survenu.
    expect(event?.request?.url).toMatch(/\/reset-password\?token=\[Filtered\]$/);
    expect(event?.breadcrumbs).toContainEqual(
      expect.objectContaining({
        category: "navigation",
        data: expect.objectContaining({ to: "/reset-password?token=[Filtered]" }),
      }),
    );
    // `sendDefaultPii: false` tel que Sentry le reçoit : l'ingestion ne déduit pas l'IP.
    expect(event?.sdk?.settings).toMatchObject({ infer_ip: "never" });
  });
});
