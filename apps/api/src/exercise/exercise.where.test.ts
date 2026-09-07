import { comparableText } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { exerciseListWhere } from "./exercise.where";

/**
 * Ce qui se vérifie ici n'est pas la construction de l'objet — elle est triviale — mais la
 * SYMÉTRIE de la recherche (#141) : l'aiguille passe par la fonction qui a rempli la colonne.
 */
describe("exerciseListWhere", () => {
  it("ne filtre rien sans filtre", () => {
    expect(exerciseListWhere({})).toEqual({});
  });

  it("retient un exercice sur l'un de ses tags", () => {
    expect(exerciseListWhere({ tag: "renfo" })).toEqual({ tags: { some: { name: "renfo" } } });
  });

  /**
   * Le cas de l'issue : un coach tape « echauffement » sans accent et doit trouver
   * « Échauffement ». La colonne portant déjà la forme comparable, c'est l'aiguille qui doit
   * s'aligner — sur `titleSearch`, jamais sur `title`.
   */
  it("cherche la forme comparable du terme, sur la colonne comparable", () => {
    expect(exerciseListWhere({ search: "  ÉCHAUFFEMENT  " })).toEqual({
      titleSearch: { contains: "echauffement" },
    });
  });

  /**
   * Le contrat, dit une fois : quel que soit le côté qui porte l'accent, la même fonction est
   * passée des deux côtés, donc la comparaison aboutit. Si un jour la lecture cesse d'appeler
   * `comparableText`, c'est cette égalité qui tombe.
   */
  it("trouve un titre accentué par les quatre façons de le taper", () => {
    // Ce que la colonne contient pour « Échauffement — dévers », posé par le service à l'écriture.
    const stored = comparableText("Échauffement — dévers");
    const typedThenSought = [
      ["echauffement", "echauffement"],
      ["Échauffement", "echauffement"],
      ["DEVERS", "devers"],
      ["dévers", "devers"],
    ] as const;

    for (const [typed, sought] of typedThenSought) {
      expect(exerciseListWhere({ search: typed })).toEqual({ titleSearch: { contains: sought } });
      // Et la moitié qui compte vraiment : ce terme-là RAMÈNE la ligne stockée.
      expect(stored).toContain(sought);
    }
  });

  it("cumule le tag et la recherche", () => {
    expect(exerciseListWhere({ tag: "grimpe", search: "Dévers" })).toEqual({
      tags: { some: { name: "grimpe" } },
      titleSearch: { contains: "devers" },
    });
  });
});
