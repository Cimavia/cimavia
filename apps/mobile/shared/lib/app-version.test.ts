import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `expo-constants` est remplacé par un objet MUTABLE plutôt que par une valeur figée : les quatre
 * cas ci-dessous décrivent quatre builds différents, et re-mocker par test coûterait un fichier par
 * cas. `vi.hoisted` est indispensable — la fabrique de `vi.mock` est remontée au-dessus des
 * déclarations, et une constante ordinaire n'existerait pas encore quand elle s'exécute.
 */
const constants = vi.hoisted(() => ({
  expoConfig: {} as { version?: string; extra?: Record<string, unknown> },
}));
vi.mock("expo-constants", () => ({ default: constants }));

const { appVersionLabel, currentAppVersion } = await import("./app-version");

beforeEach(() => {
  constants.expoConfig = {};
});

describe("currentAppVersion", () => {
  /**
   * Le NUMÉRO NU, celui que lit le `buster` du cache persisté (`query.tsx`, dette M-6). Il ne doit
   * porter aucun suffixe de tier : un schéma de cache ne dépend pas de l'endroit où l'app tourne.
   */
  it("rend le numéro d'app.json, sans suffixe", () => {
    constants.expoConfig = { version: "1.2.0", extra: { appVariant: "development" } };

    expect(currentAppVersion()).toBe("1.2.0");
  });

  it("rend null hors image", () => {
    expect(currentAppVersion()).toBeNull();
  });
});

describe("appVersionLabel (mobile)", () => {
  it("nomme la variante de build interne", () => {
    constants.expoConfig = { version: "1.2.0", extra: { appVariant: "preview" } };

    expect(appVersionLabel()).toBe("1.2.0 (preview)");
  });

  it("se tait sur le tier en production", () => {
    constants.expoConfig = { version: "1.2.0", extra: { appVariant: "production" } };

    expect(appVersionLabel()).toBe("1.2.0");
  });

  /**
   * `app.config.ts` garantit qu'`appVariant` est toujours posé, mais le harnais de test ne le
   * traverse pas : le défaut vaut ici, et il répète celui de `sentry.ts` plutôt que d'en inventer
   * un second.
   */
  it("retombe sur development quand la variante est absente", () => {
    constants.expoConfig = { version: "1.2.0" };

    expect(appVersionLabel()).toBe("1.2.0 (dev)");
  });

  it("rend null quand app.json n'a pas de version", () => {
    constants.expoConfig = { extra: { appVariant: "production" } };

    expect(appVersionLabel()).toBeNull();
  });
});
