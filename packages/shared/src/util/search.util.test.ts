import { describe, expect, it } from "vitest";
import { initialsOf } from "./name.util";
import { comparableText } from "./search.util";

describe("comparableText", () => {
  /**
   * Les deux cas qui justifient la fonction : un coach tape « lea » et doit trouver « Léa », il tape
   * « echauffement » et doit trouver « Échauffement ». Sans le dépliage NFD, la recherche échoue sur
   * exactement les mots qu'un clavier rend pénibles à écrire.
   */
  it("efface la casse et les accents", () => {
    expect(comparableText("Léa Moreau")).toBe("lea moreau");
    expect(comparableText("MOREAU")).toBe("moreau");
    expect(comparableText("Échauffement — dévers")).toBe("echauffement — devers");
  });

  it("ignore les espaces de bord, jamais ceux du milieu", () => {
    expect(comparableText("  Léa Moreau  ")).toBe("lea moreau");
    expect(comparableText("")).toBe("");
  });

  /**
   * La symétrie est le contrat : appliquée des deux côtés, la comparaison réussit quel que soit le
   * côté qui porte l'accent. C'est ce que chaque appelant doit faire.
   */
  it("rend la comparaison symétrique", () => {
    expect(comparableText("Échauffement").includes(comparableText("echauff"))).toBe(true);
    expect(comparableText("Echauffement").includes(comparableText("échauff"))).toBe(true);
  });

  // Clé de comparaison, pas d'affichage : `initialsOf` garde ses accents, lui.
  it("ne partage pas la règle d'affichage d'initialsOf", () => {
    expect(initialsOf("Élodie Noël")).toBe("ÉN");
    expect(comparableText("Élodie Noël")).toBe("elodie noel");
  });
});
