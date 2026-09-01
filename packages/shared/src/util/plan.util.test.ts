import { describe, expect, it } from "vitest";
import { shiftIsoDate } from "./date.util";
import {
  isDateInPlanWeek,
  isSelfCoached,
  planEndDate,
  planPhase,
  planWeekCopyShiftDays,
  planWeekDays,
  planWeekNumber,
  planWeekRange,
  selectCurrentPlan,
  weekSessionProgress,
} from "./plan.util";

// 2026-10-12 est un lundi (date de début de cycle valide — cf. planStartDateSchema).
const MONDAY = "2026-10-12";

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

describe("planWeekDays", () => {
  it("déroule les 7 jours du lundi au dimanche", () => {
    expect(planWeekDays(MONDAY)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("retourne null sur une date illisible (pas une semaine tronquée)", () => {
    expect(planWeekDays("2026-02-31")).toBeNull();
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

describe("planWeekCopyShiftDays", () => {
  // Un second cycle, démarrant 7 semaines après le premier (lundi lui aussi).
  const OTHER_MONDAY = "2026-11-30";

  it("décale du nombre de semaines franchies, à l'intérieur d'un même cycle", () => {
    expect(
      planWeekCopyShiftDays(
        { planStartDate: MONDAY, weekNumber: 1 },
        { planStartDate: MONDAY, weekNumber: 3 },
      ),
    ).toBe(14);
  });

  it("décale en arrière quand on colle vers une semaine antérieure", () => {
    expect(
      planWeekCopyShiftDays(
        { planStartDate: MONDAY, weekNumber: 3 },
        { planStartDate: MONDAY, weekNumber: 1 },
      ),
    ).toBe(-14);
  });

  // Le cas que `(M−N)×7` ne saurait pas traiter : deux cycles aux lundis différents.
  it("prend l'écart entre les deux lundis, et non entre les numéros de semaine", () => {
    expect(
      planWeekCopyShiftDays(
        { planStartDate: MONDAY, weekNumber: 2 },
        { planStartDate: OTHER_MONDAY, weekNumber: 1 },
      ),
    ).toBe(42);
  });

  // 0 est un RÉSULTAT, pas un aveu d'échec : deux semaines tombant sur le même lundi ne décalent
  // rien. C'est exactement pourquoi l'erreur se signale par `null` et jamais par cette valeur.
  it("rend 0 quand les deux semaines tombent sur le même lundi", () => {
    expect(
      planWeekCopyShiftDays(
        { planStartDate: MONDAY, weekNumber: 8 },
        { planStartDate: OTHER_MONDAY, weekNumber: 1 },
      ),
    ).toBe(0);
  });

  // L'invariant qui fait tenir la copie : jour de semaine préservé, et donc unicité
  // (planWeekId, scheduledDate, position) conservée après translation. Les deux sens sont
  // couverts — au-delà de la semaine 11, la cible précède la source.
  it("décale toujours d'un nombre ENTIER de semaines, entre deux cycles distincts", () => {
    for (const weekNumber of [1, 2, 5, 12, 52]) {
      const shift = planWeekCopyShiftDays(
        { planStartDate: MONDAY, weekNumber },
        { planStartDate: OTHER_MONDAY, weekNumber: 4 },
      );
      expect(shift).not.toBeNull();
      expect(Number.isInteger((shift as number) / 7)).toBe(true);
    }
  });

  it("rend null quand une semaine n'est pas situable, jamais 0", () => {
    const target = { planStartDate: MONDAY, weekNumber: 1 };
    expect(planWeekCopyShiftDays({ planStartDate: MONDAY, weekNumber: 0 }, target)).toBeNull();
    expect(planWeekCopyShiftDays({ planStartDate: MONDAY, weekNumber: -3 }, target)).toBeNull();
    expect(planWeekCopyShiftDays({ planStartDate: MONDAY, weekNumber: 1.5 }, target)).toBeNull();
    expect(
      planWeekCopyShiftDays({ planStartDate: "2026-02-31", weekNumber: 1 }, target),
    ).toBeNull();
    expect(
      planWeekCopyShiftDays(target, { planStartDate: "pas-une-date", weekNumber: 1 }),
    ).toBeNull();
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

describe("planWeekNumber", () => {
  // Cycle de 4 semaines démarrant le lundi 2026-10-12 → dernier jour = dimanche 2026-11-08.
  const PLAN = { startDate: MONDAY, weekCount: 4 };

  it("compte les semaines à partir de 1, du lundi au dimanche", () => {
    expect(planWeekNumber(PLAN, MONDAY)).toBe(1);
    expect(planWeekNumber(PLAN, "2026-10-18")).toBe(1); // dimanche de S1
    expect(planWeekNumber(PLAN, "2026-10-19")).toBe(2); // lundi de S2
    expect(planWeekNumber(PLAN, "2026-11-08")).toBe(4); // dernier jour du cycle
  });

  /**
   * Hors du cycle, `null` — jamais 1 ni `weekCount`. Un cycle qui commence lundi prochain n'en est
   * pas à sa semaine 1, et un cycle terminé n'en est pas à sa dernière : afficher « S1/4 » ou
   * « S4/4 » dans ces cas inventerait une progression que personne n'a.
   */
  it("rend null avant le début et après la fin du cycle", () => {
    expect(planWeekNumber(PLAN, "2026-10-11")).toBeNull(); // la veille du départ
    expect(planWeekNumber(PLAN, "2026-11-09")).toBeNull(); // le lendemain de la fin
  });

  it("rend null sur une date illisible ou un cycle sans semaine", () => {
    expect(planWeekNumber(PLAN, "12/10/2026")).toBeNull();
    expect(planWeekNumber({ startDate: MONDAY, weekCount: 0 }, MONDAY)).toBeNull();
    expect(planWeekNumber({ startDate: "pas une date", weekCount: 4 }, MONDAY)).toBeNull();
  });
});

describe("planPhase", () => {
  // Cycle de 4 semaines démarrant le lundi 2026-10-12 → dernier jour = dimanche 2026-11-08.
  const PLAN = { startDate: MONDAY, weekCount: 4 };

  it("situe le cycle avant, pendant et après — bornes incluses", () => {
    expect(planPhase(PLAN, "2026-10-11")).toBe("UPCOMING"); // la veille du départ
    expect(planPhase(PLAN, MONDAY)).toBe("ONGOING"); // premier jour, inclus
    expect(planPhase(PLAN, "2026-11-08")).toBe("ONGOING"); // dernier jour, inclus
    expect(planPhase(PLAN, "2026-11-09")).toBe("ENDED"); // le lendemain de la fin
  });

  it("rend null sur un cycle non situable, jamais une époque par défaut", () => {
    expect(planPhase(PLAN, "12/10/2026")).toBeNull();
    expect(planPhase({ startDate: MONDAY, weekCount: 0 }, MONDAY)).toBeNull();
    expect(planPhase({ startDate: "pas une date", weekCount: 4 }, MONDAY)).toBeNull();
  });

  /**
   * L'invariant qui interdit aux deux fonctions de diverger : elles décrivent le même cycle par
   * deux angles, et un écart de bornes ferait afficher « S4/4 » à un cycle rangé parmi les
   * terminés — ou l'inverse. Balayé sur toute la durée du cycle, débordement des deux côtés
   * compris.
   */
  it("vaut ONGOING exactement quand planWeekNumber rend un numéro", () => {
    for (let offset = -3; offset <= 4 * 7 + 3; offset++) {
      const date = shiftIsoDate(MONDAY, offset) ?? "";
      expect([date, planPhase(PLAN, date) === "ONGOING"]).toEqual([
        date,
        planWeekNumber(PLAN, date) !== null,
      ]);
    }
  });
});

describe("weekSessionProgress", () => {
  const PLANNED = { status: "PLANNED" };
  const DONE = { status: "DONE" };
  const SKIPPED = { status: "SKIPPED" };

  it("compte les séances faites sur le total de la semaine", () => {
    expect(weekSessionProgress([DONE, PLANNED, DONE, PLANNED, PLANNED])).toEqual({
      done: 2,
      total: 5,
    });
  });

  /**
   * `SKIPPED` n'est PAS un accomplissement : c'est une séance sautée. La compter comme faite
   * gonflerait l'avancement de l'athlète de tout ce qu'il n'a pas fait — et « fait » n'a qu'une
   * seule définition, celle que pose le débrief.
   */
  it("ne compte que DONE, jamais SKIPPED", () => {
    expect(weekSessionProgress([DONE, SKIPPED, SKIPPED])).toEqual({ done: 1, total: 3 });
  });

  /**
   * LA distinction qui justifie le `null` : une semaine VIDE rend `{0, 0}` (« repos, rien à
   * faire »), une liste ABSENTE rend `null` (« je ne sais pas »). Les confondre afficherait
   * « 0/0 séances faites » sur une API injoignable — le repli silencieux que la règle interdit.
   */
  it("distingue « semaine vide » de « je ne sais pas »", () => {
    expect(weekSessionProgress([])).toEqual({ done: 0, total: 0 });
    expect(weekSessionProgress(null)).toBeNull();
    expect(weekSessionProgress(undefined)).toBeNull();
  });
});

describe("isSelfCoached", () => {
  it("reconnaît le cycle qu'un coach s'écrit à lui-même", () => {
    expect(isSelfCoached({ coachId: "u1", athleteId: "u1" })).toBe(true);
  });

  it("ne confond pas un cycle écrit pour quelqu'un d'autre", () => {
    expect(isSelfCoached({ coachId: "u1", athleteId: "u2" })).toBe(false);
  });
});
