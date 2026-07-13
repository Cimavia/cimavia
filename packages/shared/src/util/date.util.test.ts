import { describe, expect, it } from "vitest";
import { daysBetweenIsoDates, isIsoDate, isMondayIsoDate, shiftIsoDate } from "./date.util";

// 2026-10-12 est un lundi (référence de tous les cas ci-dessous).
const MONDAY = "2026-10-12";

describe("isIsoDate", () => {
  it("refuse un format non ISO et une date inexistante", () => {
    expect(isIsoDate(MONDAY)).toBe(true);
    expect(isIsoDate("12/10/2026")).toBe(false);
    // Date.parse REPORTE le 31 février au 3 mars au lieu de le refuser : le piège est ici.
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });
});

describe("shiftIsoDate", () => {
  it("décale d'un nombre de jours, y compris en changeant de mois", () => {
    expect(shiftIsoDate(MONDAY, 7)).toBe("2026-10-19");
    expect(shiftIsoDate("2026-10-30", 3)).toBe("2026-11-02");
    expect(shiftIsoDate(MONDAY, -12)).toBe("2026-09-30");
  });

  it("traverse un changement d'heure sans dériver (calcul en UTC)", () => {
    // Passage à l'heure d'hiver en Europe : 2026-10-25. Un décalage naïf en heure locale
    // ferait tomber ce lundi+14 sur un dimanche.
    expect(shiftIsoDate(MONDAY, 14)).toBe("2026-10-26");
    expect(isMondayIsoDate("2026-10-26")).toBe(true);
  });

  it("retourne null sur une date invalide ou un décalage non entier", () => {
    expect(shiftIsoDate("2026-02-31", 1)).toBeNull();
    expect(shiftIsoDate("12/10/2026", 1)).toBeNull();
    expect(shiftIsoDate(MONDAY, 1.5)).toBeNull();
  });
});

describe("daysBetweenIsoDates", () => {
  it("compte les jours, négatif si la cible précède l'origine", () => {
    expect(daysBetweenIsoDates(MONDAY, "2026-10-19")).toBe(7);
    expect(daysBetweenIsoDates("2026-10-19", MONDAY)).toBe(-7);
    expect(daysBetweenIsoDates(MONDAY, MONDAY)).toBe(0);
  });

  it("retourne null sur une date invalide", () => {
    expect(daysBetweenIsoDates(MONDAY, "pas-une-date")).toBeNull();
  });
});

describe("isMondayIsoDate", () => {
  it("ne reconnaît que le lundi", () => {
    expect(isMondayIsoDate(MONDAY)).toBe(true);
    expect(isMondayIsoDate("2026-10-13")).toBe(false);
    expect(isMondayIsoDate("2026-10-18")).toBe(false); // dimanche
  });

  it("est faux (jamais null) sur une entrée invalide", () => {
    expect(isMondayIsoDate("2026-13-01")).toBe(false);
  });
});
