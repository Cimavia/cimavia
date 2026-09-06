import { describe, expect, it } from "vitest";
import { parsePlansSearch as parse } from "@/routes/plans.index";

/**
 * Ce qu'une URL bricolée à la main — ou héritée d'une version précédente de l'écran — devient
 * avant d'atteindre le tableau.
 */
describe("parsePlansSearch", () => {
  it("ramène à « Tous » un état inconnu plutôt que de refuser l'écran", () => {
    expect(parse({ state: "ONGOING" })).toMatchObject({ state: "ONGOING" });
    expect(parse({ state: "ALL" })).toMatchObject({ state: "ALL" });
    // Un paramètre malformé n'est pas une mesure métier manquante : le refus serait disproportionné.
    expect(parse({ state: "EN_COURS" })).toMatchObject({ state: undefined });
  });

  it("traite une recherche vide comme une absence de recherche", () => {
    expect(parse({ q: "lea" })).toMatchObject({ q: "lea" });
    expect(parse({ q: "" })).toMatchObject({ q: undefined });
    expect(parse({ q: 42 })).toMatchObject({ q: undefined });
  });

  it("traite un athlète vide comme aucun athlète déplié", () => {
    expect(parse({ athlete: "usr_lea" })).toMatchObject({ athlete: "usr_lea" });
    expect(parse({ athlete: "" })).toMatchObject({ athlete: undefined });
  });

  it("rend les trois clés même sur une url nue", () => {
    // Requises mais possiblement `undefined` : sous `exactOptionalPropertyTypes`, « absente » et
    // « présente à undefined » ne sont pas la même chose, et TanStack construit toujours l'objet.
    expect(parse({})).toEqual({ q: undefined, state: undefined, athlete: undefined });
  });
});
