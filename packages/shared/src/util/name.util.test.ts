import { describe, expect, it } from "vitest";
import { comparableName, initialsOf } from "./name.util";

describe("initialsOf", () => {
  it("prend la première lettre du prénom et du nom", () => {
    expect(initialsOf("Léa Moreau")).toBe("LM");
    expect(initialsOf("Thomas Rey")).toBe("TR");
  });

  // Un prénom composé ne doit pas manger la place du nom de famille : « JP » perdrait « Sartre ».
  it("traite un prénom composé comme un seul mot", () => {
    expect(initialsOf("Jean-Paul Sartre")).toBe("JS");
  });

  // Prénom + nom de famille, pas les deux premiers mots : « MA » perdrait « Dupont ».
  it("prend le premier et le DERNIER mot", () => {
    expect(initialsOf("Marie Anne Claire Dupont")).toBe("MD");
  });

  it("accepte un nom seul", () => {
    expect(initialsOf("Cimavia")).toBe("C");
  });

  // Affichage, pas clé de tri : on ne translittère pas.
  it("conserve les accents et met en majuscule", () => {
    expect(initialsOf("élodie chareyre")).toBe("ÉC");
    expect(initialsOf("Élodie Chareyre")).toBe("ÉC");
  });

  // Espaces multiples, en tête ou en fin : ils ne fabriquent pas d'initiale vide.
  it("ignore les espaces superflus", () => {
    expect(initialsOf("  Léa   Moreau  ")).toBe("LM");
  });

  /**
   * Chaîne vide en sortie — et c'est voulu : un nom vide n'a pas d'initiales à deviner. La pastille
   * rend alors un rond neutre, ce qui est l'information exacte, là où un « ? » inventerait un
   * signal.
   */
  it("rend une chaîne vide sur un nom vide", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf("   ")).toBe("");
  });
});

describe("comparableName", () => {
  /**
   * Le cas qui justifie la fonction : un coach tape « lea » et doit trouver « Léa ». Sans le
   * dépliage NFD, la recherche échouerait sur exactement les noms qu'un clavier rend pénibles.
   */
  it("efface la casse et les accents", () => {
    expect(comparableName("Léa Moreau")).toBe("lea moreau");
    expect(comparableName("MOREAU")).toBe("moreau");
    expect(comparableName("Élodie Noël")).toBe("elodie noel");
  });

  it("ignore les espaces de bord, jamais ceux du milieu", () => {
    expect(comparableName("  Léa Moreau  ")).toBe("lea moreau");
  });

  // Une clé de comparaison, pas un affichage : `initialsOf` garde ses accents, lui.
  it("ne partage pas la règle d'affichage d'initialsOf", () => {
    expect(initialsOf("Élodie Noël")).toBe("ÉN");
    expect(comparableName("")).toBe("");
  });
});
