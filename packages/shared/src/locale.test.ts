import { describe, expect, it } from "vitest";
import { Locale } from "./locale";

describe("Locale", () => {
  /**
   * Ces valeurs sont PERSISTÉES (`User.locale`, une `String` en base, défaut `"fr"`) et servent de
   * clé au catalogue de mails. En renommer une rendrait les comptes existants illisibles dans leur
   * langue, sans erreur : ils retomberaient en silence sur le repli.
   */
  it("expose les deux langues sous leur code persisté", () => {
    expect(Locale).toEqual({ FR: "fr", EN: "en" });
  });
});
