import { describe, expect, it, vi } from "vitest";
import {
  dateToIsoDate,
  daysBetweenIsoDates,
  isIsoDate,
  isMondayIsoDate,
  isoDateToDate,
  mondayOfIsoWeek,
  shiftDate,
  shiftIsoDate,
  todayIsoDate,
} from "./date.util";

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

describe("mondayOfIsoWeek", () => {
  it("remonte au lundi de la semaine (lundi → lui-même, dimanche → 6 jours en arrière)", () => {
    expect(mondayOfIsoWeek(MONDAY)).toBe(MONDAY);
    expect(mondayOfIsoWeek("2026-10-15")).toBe(MONDAY); // jeudi
    expect(mondayOfIsoWeek("2026-10-18")).toBe(MONDAY); // dimanche — le piège du getUTCDay() = 0
  });

  it("retourne null sur une date invalide", () => {
    expect(mondayOfIsoWeek("2026-02-31")).toBeNull();
  });
});

describe("pont Date ↔ date civile", () => {
  /**
   * Une colonne `@db.Date` arrive en `Date` à minuit UTC. La lire en heure locale ferait reculer
   * d'un jour tout utilisateur à l'ouest de Greenwich : le pont passe toujours par l'UTC.
   */
  it("fait l'aller-retour sans dériver d'un jour", () => {
    const date = isoDateToDate(MONDAY);
    expect(date?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(date == null ? null : dateToIsoDate(date)).toBe(MONDAY);
  });

  it("lit la date civile UTC d'un instant, quelle que soit son heure", () => {
    expect(dateToIsoDate(new Date("2026-10-12T23:59:59Z"))).toBe(MONDAY);
  });
});

describe("shiftDate", () => {
  // Par la date civile : un passage à l'heure d'hiver (25 octobre) ne décale pas d'une heure.
  it("décale d'un nombre de jours en traversant un changement d'heure", () => {
    const monday = new Date("2026-10-19T00:00:00Z");
    expect(shiftDate(monday, 7)?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(shiftDate(monday, -7)?.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("refuse un décalage qui n'est pas un nombre entier de jours", () => {
    expect(shiftDate(new Date("2026-10-19T00:00:00Z"), 1.5)).toBeNull();
  });
});

describe("todayIsoDate", () => {
  it("rend la date civile UTC du moment", () => {
    vi.useFakeTimers({ now: new Date("2026-10-12T23:30:00Z") });
    try {
      expect(todayIsoDate()).toBe(MONDAY);
    } finally {
      vi.useRealTimers();
    }
  });
});
