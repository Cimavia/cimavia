import { describe, expect, it } from "vitest";
import { libraryEmpty } from "./library-empty.util";

const view = { search: "", tagged: false, sharedOnly: false };

describe("libraryEmpty", () => {
  it("une recherche vaine propose de créer ce qu'elle cherchait", () => {
    expect(libraryEmpty({ ...view, search: "Planche", tagged: true })).toEqual({
      kind: "noMatch",
      canCreate: true,
    });
  });

  it("parmi les seuls partagés, elle ne le propose pas (frame 4)", () => {
    expect(libraryEmpty({ ...view, search: "Planche", sharedOnly: true })).toEqual({
      kind: "noMatch",
      canCreate: false,
    });
  });

  // « Rien n'est partagé avec toi » serait faux s'il ne manquait que des partagés portant ce tag.
  it("le tag passe avant la portée", () => {
    expect(libraryEmpty({ ...view, tagged: true, sharedOnly: true })).toEqual({
      kind: "noFilterMatch",
    });
  });

  it("sans filtre, les seuls partagés disent que rien n'est partagé", () => {
    expect(libraryEmpty({ ...view, sharedOnly: true })).toEqual({ kind: "sharedEmpty" });
  });

  it("sans filtre ni portée, la bibliothèque est vide", () => {
    expect(libraryEmpty(view)).toEqual({ kind: "empty" });
  });
});
