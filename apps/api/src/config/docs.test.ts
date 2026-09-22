import { describe, expect, it } from "vitest";
import { docsEnabled } from "./docs";

describe("docsEnabled", () => {
  /**
   * Le cas qui motive #263 : le NAS tourne une image, donc `NODE_ENV=production`, alors que son
   * `APP_ENV` vaut `development`. C'est bien ce premier axe qui doit décider — l'autre laisserait
   * la carte de l'API publiée sur l'environnement qu'on ferme.
   */
  it("ferme la documentation en production", () => {
    expect(docsEnabled("production")).toBe(false);
  });

  it("la garde sur une machine de développement et sous les tests", () => {
    expect(docsEnabled("development")).toBe(true);
    expect(docsEnabled("test")).toBe(true);
  });
});
