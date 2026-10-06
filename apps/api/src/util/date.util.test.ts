import { describe, expect, it, vi } from "vitest";
import { productToday, shiftDbDate, startOfProductDay, toDbDate, toIsoDate } from "./date.util";

/**
 * La POLITIQUE de l'API sur les dates : une date illisible est une donnée corrompue, donc une
 * erreur — là où @cmv/shared rend `null`. Un repli ici décalerait une séance en silence.
 */
describe("toDbDate / toIsoDate", () => {
  it("fait l'aller-retour d'une date civile sans glisser d'un jour", () => {
    expect(toIsoDate(toDbDate("2026-03-29"))).toBe("2026-03-29");
  });

  it("lève sur une date civile illisible", () => {
    expect(() => toDbDate("2026-02-30")).toThrow("[date] date civile illisible : 2026-02-30");
  });
});

describe("shiftDbDate", () => {
  it("décale d'un nombre entier de jours, dans les deux sens", () => {
    const monday = toDbDate("2026-09-28");

    expect(toIsoDate(shiftDbDate(monday, 7))).toBe("2026-10-05");
    expect(toIsoDate(shiftDbDate(monday, -7))).toBe("2026-09-21");
  });

  // Le message dit le sens du décalage demandé : c'est lui qu'on cherche en lisant l'erreur.
  it.each([
    [1.5, "[date] décalage impossible (2026-09-28T00:00:00.000Z +1.5j)"],
    [-0.5, "[date] décalage impossible (2026-09-28T00:00:00.000Z -0.5j)"],
  ])("lève sur un décalage de %s jour", (days, message) => {
    expect(() => shiftDbDate(toDbDate("2026-09-28"), days)).toThrow(message);
  });
});

/**
 * L'heure du produit (« Tranché en #321 ») : Paris, quel que soit le fuseau du conteneur. Le lundi
 * 14/09 à 0 h 30 à Paris est encore dimanche en UTC — c'est lundi qu'il faut répondre.
 */
describe("productToday", () => {
  it("rend le jour à Paris, pas le jour UTC", () => {
    vi.useFakeTimers({ now: new Date("2026-09-13T22:30:00Z") });
    try {
      expect(productToday()).toBe("2026-09-14");
    } finally {
      vi.useRealTimers();
    }
  });

  it("lève sur un fuseau inconnu", () => {
    expect(() => productToday("Europe/Atlantide")).toThrow(
      "[date] fuseau inconnu : Europe/Atlantide",
    );
  });
});

describe("startOfProductDay", () => {
  it("rend minuit à Paris, en été comme en hiver", () => {
    expect(startOfProductDay(toDbDate("2026-10-05")).toISOString()).toBe(
      "2026-10-04T22:00:00.000Z",
    );
    expect(startOfProductDay(toDbDate("2026-01-05")).toISOString()).toBe(
      "2026-01-04T23:00:00.000Z",
    );
  });

  it("lève plutôt que de deviner un début de jour", () => {
    expect(() => startOfProductDay(toDbDate("2026-10-05"), "Europe/Atlantide")).toThrow(
      "[date] début de jour introuvable (2026-10-05, Europe/Atlantide)",
    );
  });
});
