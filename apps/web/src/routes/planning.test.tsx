import { describe, expect, it } from "vitest";
import { parsePlanningSearch as parse } from "@/routes/planning";

/**
 * Ce qu'une URL bricolée à la main — ou héritée du `?week=<n>` d'avant #172 — devient avant
 * d'atteindre le planning.
 */
describe("parsePlanningSearch", () => {
  it("accepte un lundi, et lui seul", () => {
    // 2026-10-12 est un lundi, le 13 un mardi.
    expect(parse({ from: "2026-10-12" })).toEqual({ from: "2026-10-12" });
    expect(parse({ from: "2026-10-13" })).toEqual({ from: undefined });
  });

  /**
   * Une grille décalée d'un jour serait pire qu'un retour au défaut : l'athlète lirait sa semaine
   * du mardi au lundi sans que rien ne le lui dise.
   */
  it("retombe sur le défaut plutôt que de dessiner une semaine décalée", () => {
    expect(parse({ from: "pas-une-date" })).toEqual({ from: undefined });
    expect(parse({ from: "2026-02-31" })).toEqual({ from: undefined });
    expect(parse({ from: 42 })).toEqual({ from: undefined });
    expect(parse({})).toEqual({ from: undefined });
  });

  // L'ancien paramètre ne doit surtout pas être réinterprété : « semaine 3 » n'est pas une date.
  it("ignore le paramètre de semaine d'avant #172", () => {
    expect(parse({ week: 3 })).toEqual({ from: undefined });
  });
});
