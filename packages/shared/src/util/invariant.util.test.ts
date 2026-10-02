import { describe, expect, it } from "vitest";
import { required } from "../index";

describe("required", () => {
  // `0`, `""` et `false` sont des VALEURS : les prendre pour une absence ferait lever sur une
  // durée nulle ou un libellé vide.
  it("rend la valeur, même falsy", () => {
    expect(required(0, "durée")).toBe(0);
    expect(required("", "libellé")).toBe("");
    expect(required(false, "drapeau")).toBe(false);
  });

  it("lève avec le message de l'invariant sur null ou undefined", () => {
    expect(() => required(null, "[account] utilisateur introuvable")).toThrow(
      new Error("[account] utilisateur introuvable"),
    );
    expect(() => required(undefined, "palier hors échelle")).toThrow("palier hors échelle");
  });
});
