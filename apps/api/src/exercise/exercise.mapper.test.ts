import { describe, expect, it } from "vitest";
import { tagNamesOf } from "./exercise.mapper";

describe("tagNamesOf", () => {
  it("range un tag accentué avec sa lettre, pas après le z", () => {
    const tags = [{ name: "vitesse" }, { name: "échauffement" }, { name: "dos" }];

    expect(tagNamesOf(tags)).toEqual(["dos", "échauffement", "vitesse"]);
  });

  it("laisse la liste reçue dans l'ordre d'insertion", () => {
    const tags = [{ name: "force" }, { name: "cardio" }];

    tagNamesOf(tags);

    expect(tags.map((tag) => tag.name)).toEqual(["force", "cardio"]);
  });
});
