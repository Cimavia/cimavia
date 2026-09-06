import { describe, expect, it } from "vitest";
import { parseInvoicesSearch as parse } from "@/routes/invoices";

/**
 * Ce qu'une URL bricolée à la main — ou héritée d'une version précédente de l'écran — devient
 * avant d'atteindre le tableau.
 */
describe("parseInvoicesSearch", () => {
  it("ne retient que les deux titres connus", () => {
    expect(parse({ as: "coach" })).toMatchObject({ as: "coach" });
    expect(parse({ as: "athlete" })).toMatchObject({ as: "athlete" });
    // Un titre inconnu n'en est pas un : l'écran retombe sur la capacité de la session.
    expect(parse({ as: "admin" })).toMatchObject({ as: undefined });
  });

  it("ramène à « Tous » une situation inconnue plutôt que de refuser l'écran", () => {
    expect(parse({ situation: "OVERDUE" })).toMatchObject({ situation: "OVERDUE" });
    // Un paramètre malformé n'est pas une mesure métier manquante : le refus serait disproportionné.
    expect(parse({ situation: "EN_RETARD" })).toMatchObject({ situation: undefined });
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

  it("rend les quatre clés même sur une url nue", () => {
    // Requises mais possiblement `undefined` : sous `exactOptionalPropertyTypes`, « absente » et
    // « présente à undefined » ne sont pas la même chose, et TanStack construit toujours l'objet.
    expect(parse({})).toEqual({
      as: undefined,
      q: undefined,
      situation: undefined,
      athlete: undefined,
    });
  });
});
