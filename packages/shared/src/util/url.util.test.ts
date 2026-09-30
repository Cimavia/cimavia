import { describe, expect, it } from "vitest";
import { trimTrailingSlashes } from "./url.util";

describe("trimTrailingSlashes", () => {
  it("retire une barre oblique finale", () => {
    expect(trimTrailingSlashes("https://app.cimavia.fr/")).toBe("https://app.cimavia.fr");
  });

  // Une valeur recollée à la main peut en porter plusieurs : toutes partent.
  it("retire toutes les barres obliques finales", () => {
    expect(trimTrailingSlashes("https://app.cimavia.fr///")).toBe("https://app.cimavia.fr");
  });

  // Seule la FIN est nettoyée : celles du schéma et du chemin restent.
  it("laisse une origine sans barre finale intacte", () => {
    expect(trimTrailingSlashes("http://localhost:5173/app")).toBe("http://localhost:5173/app");
  });

  it("rend une chaîne vide sur une chaîne faite de barres", () => {
    expect(trimTrailingSlashes("//")).toBe("");
    expect(trimTrailingSlashes("")).toBe("");
  });
});
