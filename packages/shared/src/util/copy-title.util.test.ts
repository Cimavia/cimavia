import { describe, expect, it } from "vitest";
import { copyTitle } from "../index";

describe("copyTitle", () => {
  it("accole le suffixe au titre de la source", () => {
    expect(copyTitle("Bloc force", "(copie)", 200)).toBe("Bloc force (copie)");
  });

  it("raccourcit le titre, jamais le suffixe, pour tenir dans la borne", () => {
    const title = "a".repeat(200);
    const copy = copyTitle(title, "(copie)", 200);
    expect(copy).toBe(`${"a".repeat(192)} (copie)`);
    expect(copy?.length).toBe(200);
  });

  it("ne laisse pas deux espaces quand la coupe tombe sur un espace", () => {
    expect(copyTitle("Bloc force max", "(copie)", 13)).toBe("Bloc (copie)");
  });

  it("ne coupe pas un emoji en deux", () => {
    // « 💪 » compte pour 2 unités UTF-16 : il ne reste qu'une place, il ne passe pas.
    expect(copyTitle("a💪", "(copie)", 10)).toBe("a (copie)");
    expect(copyTitle("a💪", "(copie)", 11)).toBe("a💪 (copie)");
  });

  it("garde le suffixe seul quand la borne ne laisse aucune place au titre", () => {
    expect(copyTitle("Bloc force", "(copie)", 8)).toBe("(copie)");
    expect(copyTitle("Bloc force", "(copie)", 7)).toBe("(copie)");
  });

  it("rend null quand le suffixe seul ne tient pas", () => {
    expect(copyTitle("Bloc force", "(copie)", 6)).toBeNull();
  });
});
