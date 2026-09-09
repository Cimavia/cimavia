import { describe, expect, it } from "vitest";
import { versionDtoSchema } from "./version.schema";

/**
 * Deux invariants, et rien d'autre : le contrat de l'absence, et le fait que le tier soit une
 * liste fermée. Ce sont les deux endroits où ce DTO peut se mettre à mentir.
 */
describe("versionDtoSchema", () => {
  it("accepte une version portée par l'image", () => {
    const parsed = versionDtoSchema.parse({
      version: "1.2.0",
      build: "3f2a1c",
      env: "production",
    });

    expect(parsed).toEqual({ version: "1.2.0", build: "3f2a1c", env: "production" });
  });

  /**
   * Le cas hors image — `pnpm dev`, `docker build` sans `--build-arg`. `null` doit passer : c'est
   * ce qui permet à l'API de dire qu'elle ne sait pas, plutôt que d'annoncer un « 0.0.0 » que le
   * client afficherait comme un vrai numéro (règle dure n°5).
   */
  it("accepte une version et un build absents", () => {
    expect(versionDtoSchema.parse({ version: null, build: null, env: "development" })).toEqual({
      version: null,
      build: null,
      env: "development",
    });
  });

  /**
   * Le tier est une liste FERMÉE, alignée sur `APP_ENV`. L'ouvrir laisserait un jour passer une
   * valeur que l'écran d'à-propos afficherait telle quelle en suffixe, sans que rien ne bronche.
   */
  it("refuse un tier qui n'existe pas", () => {
    expect(() => versionDtoSchema.parse({ version: null, build: null, env: "preprod" })).toThrow();
  });
});
