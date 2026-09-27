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

const initial = window.__CMV_CONFIG__;
const DSN = "https://clef@o0.ingest.sentry.io/1";

/** Ce que `/config.js` aurait posé — le DSN et le tier y sont lus depuis #417. */
function config(fields: { sentryDsn?: string; tier?: string }) {
  window.__CMV_CONFIG__ = {
    apiUrl: "http://localhost:3000",
    tier: "development",
    sentryDsn: "",
    ...fields,
  };
}

beforeEach(() => {
  sent.length = 0;
});

afterEach(async () => {
  await Sentry.close();
  window.history.replaceState(null, "", "/");
  window.__CMV_CONFIG__ = initial;
});

describe("instrument", () => {
  it("laisse le SDK inerte quand aucun DSN n'est configuré", async () => {
    config({ sentryDsn: "" });

    const options = await loadInstrument();

    // `enabled: false` ET pas de DSN : c'est le cas du poste de développement, où l'on ne
    // configure rien et où l'app doit démarrer exactement pareil.
    expect(options).toMatchObject({ enabled: false, dsn: undefined });
  });

  it("arme le SDK quand un DSN est configuré", async () => {
    config({ sentryDsn: DSN });

    const options = await loadInstrument();

    expect(options).toMatchObject({ enabled: true, dsn: DSN });
  });

  it("tague le tier de déploiement, pas le mode de build", async () => {
    config({ sentryDsn: DSN, tier: "preview" });

    expect(await loadInstrument()).toMatchObject({ environment: "preview" });
  });

  /**
   * Avant #417, un tier absent retombait sur `development`. Il n'a plus de défaut : un événement
   * sans `environment` ne se filtrerait nulle part, et un `development` inventé mentirait. Le SDK
   * reste donc inerte, et c'est l'écran de crash de `main.tsx` qui dit l'erreur de configuration.
   */
  it("reste inerte quand le tier manque, même avec un DSN", async () => {
    config({ sentryDsn: DSN, tier: "" });

    expect(await loadInstrument()).toMatchObject({ enabled: false, dsn: undefined });
  });

  it("désactive les traces de performance", async () => {
    config({ sentryDsn: DSN });

    // La décision de #183 que rien d'autre ne retient : le quota de performance ne se vide pas
    // depuis un navigateur.
    expect(await loadInstrument()).toMatchObject({ tracesSampleRate: 0 });
  });

  it("n'envoie ni l'IP, ni le jeton de réinitialisation que porte l'URL", async () => {
    config({ sentryDsn: DSN });
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
