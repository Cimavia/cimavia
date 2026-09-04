import { describe, expect, it } from "vitest";
import { translatedOr } from "./i18n-fallback.util";

describe("translatedOr", () => {
  it("rend la traduction quand i18next a résolu la clé", () => {
    expect(translatedOr("Recharger la page", "common.crash.reload", "secours")).toBe(
      "Recharger la page",
    );
  });

  it("rend le texte de secours quand i18next a rendu la clé brute", () => {
    // Le signal d'i18next pour « je n'ai rien trouvé » : il rend la clé. C'est ce cas, et lui
    // seul, qui fait exister cette fonction.
    expect(translatedOr("common.crash.reload", "common.crash.reload", "secours")).toBe("secours");
  });

  it("ne se laisse pas tromper par une clé voisine", () => {
    // Une heuristique de préfixe (« ça commence par common.crash. ») aurait pris cette traduction
    // pour un échec. La comparaison exacte, non.
    expect(translatedOr("common.crash.reload", "common.crash.title", "secours")).toBe(
      "common.crash.reload",
    );
  });

  it("laisse passer une traduction vide sans la remplacer", () => {
    // Une chaîne vide EST une traduction — un libellé volontairement effacé au catalogue. La
    // confondre avec un échec ferait réapparaître un texte que quelqu'un avait retiré exprès.
    expect(translatedOr("", "common.crash.title", "secours")).toBe("");
  });
});
