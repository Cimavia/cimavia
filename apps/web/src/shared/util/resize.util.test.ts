import { describe, expect, it } from "vitest";
import { clamp, clampSize } from "./resize.util";

describe("clamp", () => {
  it.each([
    [500, 500],
    [100, 320],
    [2000, 1000],
  ])("ramène %i dans [320, 1000] → %i", (value, expected) => {
    expect(clamp(value, 320, 1000)).toBe(expected);
  });

  // Fenêtre plus étroite que le panneau d'origine : on garde l'origine plutôt que de le rogner.
  it("garde le minimum quand la fenêtre est plus petite que lui", () => {
    expect(clamp(400, 320, 200)).toBe(320);
  });
});

describe("clampSize", () => {
  // Une taille enregistrée sur un grand écran, relue sur un petit.
  it("borne chaque dimension pour elle-même", () => {
    expect(
      clampSize(
        { width: 1800, height: 200 },
        { width: 320, height: 384 },
        { width: 900, height: 700 },
      ),
    ).toEqual({ width: 900, height: 384 });
  });
});
