import { describe, expect, it } from "vitest";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "./datetime-local.util";

describe("toDatetimeLocalValue", () => {
  /**
   * Le piège que ce module existe pour éviter : `toISOString()` rend de l'UTC, donc « 09:00 » à
   * Paris s'y afficherait « 07:00 ». On compare donc aux composantes LOCALES de la date, jamais à
   * une chaîne écrite en dur — un test figé sur un fuseau passerait en France et échouerait en CI.
   */
  it("rend les composantes locales, et non l'instant UTC", () => {
    const date = new Date(2026, 7, 15, 9, 0);
    expect(toDatetimeLocalValue(date)).toBe("2026-08-15T09:00");
  });

  it("complète mois, jour, heure et minute sur deux chiffres", () => {
    expect(toDatetimeLocalValue(new Date(2026, 0, 3, 4, 5))).toBe("2026-01-03T04:05");
  });
});

describe("fromDatetimeLocalValue", () => {
  it("rend null sur un champ vide : un formulaire non rempli n'est pas une date", () => {
    expect(fromDatetimeLocalValue("")).toBeNull();
  });

  it("rend null sur une valeur illisible plutôt qu'une Invalid Date silencieuse", () => {
    expect(fromDatetimeLocalValue("pas-une-date")).toBeNull();
  });

  it("lit la valeur en heure LOCALE, comme la spec l'impose pour une forme sans fuseau", () => {
    const iso = fromDatetimeLocalValue("2026-08-15T09:00");
    expect(iso).toBe(new Date(2026, 7, 15, 9, 0).toISOString());
  });

  // L'aller-retour est ce que le formulaire fait vraiment : lire un rappel, l'afficher, le renvoyer.
  it("fait l'aller-retour sans décaler l'instant", () => {
    const start = new Date(2026, 10, 2, 18, 30);
    expect(fromDatetimeLocalValue(toDatetimeLocalValue(start))).toBe(start.toISOString());
  });
});
