import { describe, expect, it } from "vitest";
import { shouldShowCharCount } from "./char-count.util";

describe("shouldShowCharCount", () => {
  it("tait le compteur loin de la borne, vide compris", () => {
    expect(shouldShowCharCount(0, 5000)).toBe(false);
    expect(shouldShowCharCount(4499, 5000)).toBe(false);
  });

  it("l'affiche dès 90 % de la borne, et jusqu'à la borne", () => {
    expect(shouldShowCharCount(4500, 5000)).toBe(true);
    expect(shouldShowCharCount(5000, 5000)).toBe(true);
  });

  it("arrondit le seuil vers le haut sur une petite borne", () => {
    // 90 % de 12 = 10,8 : le compteur attend le 11e caractère.
    expect(shouldShowCharCount(10, 12)).toBe(false);
    expect(shouldShowCharCount(11, 12)).toBe(true);
  });
});
