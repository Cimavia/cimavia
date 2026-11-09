import { beforeEach, describe, expect, it, vi } from "vitest";

const { expoClient } = vi.hoisted(() => ({
  expoClient: vi.fn((_options: { scheme: string }) => ({ id: "expo" })),
}));
vi.mock("@better-auth/expo/client", () => ({ expoClient }));

/**
 * Le client est construit AU CHARGEMENT du module, sur le scheme de la variante de build : chaque
 * cas recharge donc le module sous sa propre config Expo.
 */
async function schemeFor(scheme: string | string[] | undefined): Promise<string | undefined> {
  vi.resetModules();
  vi.doMock("expo-constants", () => ({ default: { expoConfig: { scheme } } }));
  await import("./auth");
  return expoClient.mock.calls.at(-1)?.[0].scheme;
}

beforeEach(() => {
  expoClient.mockClear();
});

/**
 * Le scheme doit correspondre à une origine de confiance côté API (`origins.ts`) : un scheme faux,
 * et chaque retour de connexion par lien profond est refusé.
 */
describe("authClient — scheme de la variante de build", () => {
  it("reprend le scheme déclaré", async () => {
    expect(await schemeFor("cimavia-preview")).toBe("cimavia-preview");
  });

  /** `app.config.ts` peut déclarer plusieurs schemes : le premier est celui de l'app. */
  it("prend le premier d'une liste", async () => {
    expect(await schemeFor(["cimavia-dev", "exp+cimavia"])).toBe("cimavia-dev");
  });

  it("retombe sur celui de production sans config", async () => {
    expect(await schemeFor(undefined)).toBe("cimavia");
  });
});

/**
 * Le signal que Better Auth émet lui-même après une connexion : tous les `useSession()` suivent. Le
 * module est rechargé par `schemeFor` : chaque cas relit donc le client qu'il vient d'importer.
 */
describe("recheckSession", () => {
  async function withSession(data: unknown) {
    vi.resetModules();
    const { authClient, recheckSession } = await import("./auth");
    const session = authClient.$store.atoms.session;
    session?.set({ ...session.get(), data });
    const signalled = vi.fn();
    const stop = authClient.$store.atoms.$sessionSignal?.listen(signalled);
    recheckSession();
    stop?.();
    return signalled;
  }

  it("demande une relecture tant qu'une session est connue", async () => {
    expect(await withSession({ user: { id: "lea" } })).toHaveBeenCalledTimes(1);
  });

  // Sous le voile, les sondages continuent de prendre des 401 : la perte est déjà connue.
  it("ne relit plus rien une fois la session vide", async () => {
    expect(await withSession(null)).not.toHaveBeenCalled();
  });
});
