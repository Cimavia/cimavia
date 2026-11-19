import { describe, expect, it } from "vitest";
import { movedItem } from "./list.util";

describe("movedItem", () => {
  it("déplace un élément vers le bas, à la place de celui qu'il vise", () => {
    expect(movedItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(movedItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("déplace un élément vers le haut, à la place de celui qu'il vise", () => {
    expect(movedItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(movedItem(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
  });

  it("ne touche pas la liste reçue", () => {
    const items = ["a", "b", "c"];

    movedItem(items, 0, 2);

    expect(items).toEqual(["a", "b", "c"]);
  });

  it("garde un élément `undefined` à sa nouvelle place", () => {
    expect(movedItem(["a", undefined, "c"], 1, 2)).toEqual(["a", "c", undefined]);
  });

  // Un rang négatif compterait depuis la fin dans `splice` : la flèche ↑ sur le premier élément
  // l'enverrait en avant-dernière place, en silence.
  it.each([
    ["vise avant la liste", 0, -1],
    ["vise après la liste", 2, 3],
    ["part d'avant la liste", -1, 0],
    ["part d'après la liste", 3, 0],
    ["est déposé sur lui-même", 1, 1],
  ])("rend null quand l'élément %s", (_case, from, to) => {
    expect(movedItem(["a", "b", "c"], from, to)).toBeNull();
  });

  it("rend null sur une liste vide", () => {
    expect(movedItem([], 0, 0)).toBeNull();
  });
});
