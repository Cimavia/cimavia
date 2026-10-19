import { describe, expect, it } from "vitest";
import { tagFilterOptions, toggledTags } from "./tag-filter.util";

describe("tagFilterOptions", () => {
  it("propose les tags connus, triés", () => {
    expect(tagFilterOptions(["mobilité", "force", "gainage"], [])).toEqual([
      "force",
      "gainage",
      "mobilité",
    ]);
  });

  it("garde un tag choisi qui a quitté la liste, pour pouvoir le décocher", () => {
    expect(tagFilterOptions(["gainage"], ["force", "gainage"])).toEqual(["force", "gainage"]);
    expect(tagFilterOptions([], ["force"])).toEqual(["force"]);
  });

  it("rien de connu ni de choisi : aucune pastille", () => {
    expect(tagFilterOptions([], [])).toEqual([]);
  });
});

describe("toggledTags", () => {
  it("ajoute un tag absent, et rend un choix trié", () => {
    expect(toggledTags(["gainage"], "force")).toEqual(["force", "gainage"]);
  });

  it("retire un tag présent", () => {
    expect(toggledTags(["force", "gainage"], "force")).toEqual(["gainage"]);
    expect(toggledTags(["force"], "force")).toEqual([]);
  });

  it("ne touche pas au choix reçu", () => {
    const chosen = ["gainage"];
    toggledTags(chosen, "force");
    expect(chosen).toEqual(["gainage"]);
  });
});
