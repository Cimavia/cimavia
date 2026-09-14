import { describe, expect, it } from "vitest";
import { type AppTier, formatAppVersion } from "./app-version.util";

describe("formatAppVersion", () => {
  /**
   * La production est le SEUL tier muet : c'est le seul où l'utilisateur n'a pas à se demander où
   * il est. Partout ailleurs, le suffixe est l'information utile — un retour de bêta sans lui
   * coûte un aller-retour pour savoir sur quoi la personne était.
   */
  it("ne suffixe rien en production", () => {
    expect(formatAppVersion("1.2.0", "production")).toBe("1.2.0");
  });

  it.each<[AppTier, string]>([
    ["development", "1.2.0 (dev)"],
    ["preview", "1.2.0 (preview)"],
    ["staging", "1.2.0 (staging)"],
  ])("nomme le tier %s", (tier, expected) => {
    expect(formatAppVersion("1.2.0", tier)).toBe(expected);
  });

  /**
   * Hors image — `pnpm dev`, un build local sans injection — il n'y a pas de version. Rendre `null`
   * laisse le RENDU dire l'absence avec le `—` du reste du produit ; rendre `"0.0.0 (dev)"` la
   * ferait passer pour un vrai numéro, et un retour de bêta le citerait de bonne foi.
   */
  it("rend null quand la version n'a pas été injectée", () => {
    expect(formatAppVersion(null, "development")).toBeNull();
  });

  /**
   * La chaîne vide est le cas RÉEL, et non une coquetterie : `ARG VITE_APP_VERSION=` sans valeur
   * produit `""`, pas `undefined`. La traiter comme une valeur afficherait ` (dev)` tout seul —
   * un suffixe orphelin, exactement le défaut que « Tranché en #137 » décrit à propos du vide.
   */
  it("traite une version vide comme une absence", () => {
    expect(formatAppVersion("", "production")).toBeNull();
  });
});
