import { describe, expect, it } from "vitest";
import { shiftDbDate, toDbDate, toIsoDate } from "./date.util";

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
