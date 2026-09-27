import { afterEach, describe, expect, it, vi } from "vitest";
import { appVersionLabel } from "./app-version";

const initial = window.__CMV_CONFIG__;

function tier(value: string) {
  window.__CMV_CONFIG__ = { apiUrl: "http://localhost:3000", tier: value, sentryDsn: "" };
}

afterEach(() => {
  vi.unstubAllEnvs();
  window.__CMV_CONFIG__ = initial;
});

describe("appVersionLabel (web)", () => {
  it("compose le numéro figé dans le bundle et le tier lu au démarrage", () => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.0");
    tier("preview");

    expect(appVersionLabel()).toBe("1.2.0 (preview)");
  });

  it("se tait sur le tier en production", () => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.0");
    tier("production");

    expect(appVersionLabel()).toBe("1.2.0");
  });

  /**
   * Le cas d'un `pnpm dev` : `VITE_APP_VERSION` n'existe pas. Rendre `null` laisse l'écran dire
   * l'absence, au lieu d'afficher un numéro que personne n'a construit (règle dure n°5).
   */
  it("rend null quand rien n'a été injecté au build", () => {
    vi.stubEnv("VITE_APP_VERSION", undefined);
    tier("development");

    expect(appVersionLabel()).toBeNull();
  });

  /** Ce que produit `ARG VITE_APP_VERSION=` sans valeur, dans un build d'image sans numéro. */
  it("rend null quand la version injectée est vide", () => {
    vi.stubEnv("VITE_APP_VERSION", "");
    tier("development");

    expect(appVersionLabel()).toBeNull();
  });

  /**
   * Le tier n'a plus de défaut depuis #417 : il n'est plus figé au build mais lu dans `config.js`,
   * et un tier absent y est une erreur de configuration, pas un poste de développement.
   */
  it("rend null quand le tier est absent, au lieu de supposer development", () => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.0");
    tier("");

    expect(appVersionLabel()).toBeNull();
  });
});
