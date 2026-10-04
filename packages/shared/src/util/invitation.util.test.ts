import { describe, expect, it } from "vitest";
import { invitationEmailOf } from "../index";

describe("invitationEmailOf", () => {
  it("rend l'adresse telle que saisie quand elle peut partir", () => {
    expect(invitationEmailOf("lea@exemple.fr")).toBe("lea@exemple.fr");
  });

  // Le copier-coller depuis un message emporte souvent une espace : elle ne doit rien bloquer.
  it("retire les blancs autour", () => {
    expect(invitationEmailOf("  lea@exemple.fr \n")).toBe("lea@exemple.fr");
  });

  // La comparaison normalise côté API : le Coach doit retrouver dans sa liste ce qu'il a tapé.
  it("garde la casse de la saisie", () => {
    expect(invitationEmailOf("Lea@Exemple.fr")).toBe("Lea@Exemple.fr");
  });

  it.each([
    ["un champ vide", ""],
    ["des blancs seuls", "   "],
    ["une adresse sans domaine", "lea@"],
    ["une adresse sans arobase", "lea.exemple.fr"],
  ])("rend null pour %s", (_case, raw) => {
    expect(invitationEmailOf(raw)).toBeNull();
  });
});
