import { afterEach, describe, expect, it, vi } from "vitest";
import { appVersionLabel } from "./app-version";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("appVersionLabel (web)", () => {
  it("compose le numéro et le tier figés dans le bundle", () => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.0");
    vi.stubEnv("VITE_APP_ENV", "staging");

    expect(appVersionLabel()).toBe("1.2.0 (staging)");
  });

  it("se tait sur le tier en production", () => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.0");
    vi.stubEnv("VITE_APP_ENV", "production");

    expect(appVersionLabel()).toBe("1.2.0");
  });

  /**
   * Le cas d'un `pnpm dev` : `VITE_APP_VERSION` n'existe pas. Rendre `null` laisse l'écran dire
   * l'absence, au lieu d'afficher un numéro que personne n'a construit (règle dure n°5).
   */
  it("rend null quand rien n'a été injecté au build", () => {
    vi.stubEnv("VITE_APP_VERSION", "");
    vi.stubEnv("VITE_APP_ENV", "");

    expect(appVersionLabel()).toBeNull();
  });

  /**
   * Le tier, lui, A un défaut — le même que celui d'`instrument.ts` et du schéma `@cmv/shared`. Il
   * n'invente rien, il répète une valeur déjà décidée ailleurs.
   */
  it("retombe sur development quand le tier est absent", () => {
    vi.stubEnv("VITE_APP_VERSION", "1.2.0");
    vi.stubEnv("VITE_APP_ENV", "");

    expect(appVersionLabel()).toBe("1.2.0 (dev)");
  });
});
