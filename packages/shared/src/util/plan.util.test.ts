import { describe, expect, it } from "vitest";
import {
  daysBetweenIsoDates,
  isDateInPlanWeek,
  isMondayIsoDate,
  planEndDate,
  planWeekRange,
  selectCurrentPlan,
  shiftIsoDate,
} from "./plan.util";

// 2026-10-12 est un lundi (référence de tous les cas ci-dessous).
const MONDAY = "2026-10-12";

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

describe("planWeekRange", () => {
  it("déduit la plage lundi→dimanche du numéro de semaine (1-based)", () => {
    expect(planWeekRange(MONDAY, 1)).toEqual({
      startDate: "2026-10-12",
      endDate: "2026-10-18",
    });
    expect(planWeekRange(MONDAY, 3)).toEqual({
      startDate: "2026-10-26",
      endDate: "2026-11-01",
    });
  });

  it("retourne null pour un numéro de semaine hors bornes", () => {
    expect(planWeekRange(MONDAY, 0)).toBeNull();
    expect(planWeekRange(MONDAY, -1)).toBeNull();
    expect(planWeekRange(MONDAY, 1.5)).toBeNull();
  });
});

describe("planEndDate", () => {
  it("finit le dimanche de la dernière semaine", () => {
    expect(planEndDate(MONDAY, 1)).toBe("2026-10-18");
    expect(planEndDate(MONDAY, 4)).toBe("2026-11-08");
  });

  it("retourne null pour un plan sans semaine", () => {
    expect(planEndDate(MONDAY, 0)).toBeNull();
  });
});

describe("isDateInPlanWeek", () => {
  it("borne la semaine (dimanche inclus, lundi suivant exclu)", () => {
    expect(isDateInPlanWeek(MONDAY, 1, "2026-10-12")).toBe(true);
    expect(isDateInPlanWeek(MONDAY, 1, "2026-10-18")).toBe(true);
    expect(isDateInPlanWeek(MONDAY, 1, "2026-10-19")).toBe(false);
    expect(isDateInPlanWeek(MONDAY, 2, "2026-10-19")).toBe(true);
    expect(isDateInPlanWeek(MONDAY, 1, "2026-10-11")).toBe(false);
  });
});

describe("selectCurrentPlan", () => {
  const past = { id: "past", startDate: "2026-09-07", weekCount: 4 }; // → 2026-10-04
  const ongoing = { id: "ongoing", startDate: MONDAY, weekCount: 4 }; // → 2026-11-08
  const upcoming = { id: "upcoming", startDate: "2026-11-09", weekCount: 4 };

  it("privilégie le cycle en cours", () => {
    expect(selectCurrentPlan([past, upcoming, ongoing], "2026-10-14")?.id).toBe("ongoing");
  });

  it("entre deux cycles, montre le prochain plutôt que le précédent", () => {
    expect(selectCurrentPlan([past, upcoming], "2026-10-20")?.id).toBe("upcoming");
  });

  it("à défaut, montre le dernier cycle terminé", () => {
    expect(selectCurrentPlan([past], "2026-10-20")?.id).toBe("past");
  });

  it("départage plusieurs cycles en cours par la date de début la plus récente", () => {
    const replacement = { id: "replacement", startDate: "2026-10-19", weekCount: 2 };
    expect(selectCurrentPlan([ongoing, replacement], "2026-10-20")?.id).toBe("replacement");
  });

  it("retourne null sans plan exploitable (pas de valeur de repli)", () => {
    expect(selectCurrentPlan([], "2026-10-14")).toBeNull();
    // Plan sans semaine : aucune période → ignoré.
    expect(
      selectCurrentPlan([{ id: "empty", startDate: MONDAY, weekCount: 0 }], MONDAY),
    ).toBeNull();
  });
});
