import { describe, expect, it } from "vitest";
import { initialsOf } from "./name.util";

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
