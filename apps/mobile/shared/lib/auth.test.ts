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
