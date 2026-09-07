import { describe, expect, it } from "vitest";
import { PlanStatus } from "../dto/plan.schema";
import { shiftIsoDate } from "./date.util";
import {
  isDateInPlanWeek,
  isSelfCoached,
  PLAN_STATE_BADGE,
  PLAN_STATES,
  planAudience,
  planEndDate,
  planPhase,
  planState,
  planWeekCopyShiftDays,
  planWeekDays,
  planWeekNumber,
  planWeekRange,
  selectCurrentPlan,
  selectVisiblePlans,
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

  // Le RÉSUMÉ n'en retient qu'un ; l'athlète, lui, les voit tous (cf. selectVisiblePlans).
  it("départage plusieurs cycles en cours par la date de début la plus récente", () => {
    const second = { id: "second", startDate: "2026-10-19", weekCount: 2 };
    expect(selectCurrentPlan([ongoing, second], "2026-10-20")?.id).toBe("second");
  });

  it("retourne null sans plan exploitable (pas de valeur de repli)", () => {
    expect(selectCurrentPlan([], "2026-10-14")).toBeNull();
    // Plan sans semaine : aucune période → ignoré.
    expect(
      selectCurrentPlan([{ id: "empty", startDate: MONDAY, weekCount: 0 }], MONDAY),
    ).toBeNull();
  });
});

describe("selectVisiblePlans", () => {
  const past = { id: "past", startDate: "2026-09-07", weekCount: 4 }; // → 2026-10-04
  const ongoing = { id: "ongoing", startDate: MONDAY, weekCount: 4 }; // → 2026-11-08
  const second = { id: "second", startDate: "2026-10-19", weekCount: 2 }; // → 2026-11-01
  const upcoming = { id: "upcoming", startDate: "2026-11-09", weekCount: 4 };

  const idsAt = (plans: { id: string; startDate: string; weekCount: number }[], today: string) =>
    selectVisiblePlans(plans, today).map((plan) => plan.id);

  it("sert TOUS les cycles en cours, pas seulement le dernier démarré", () => {
    expect(idsAt([ongoing, second], "2026-10-20")).toEqual(["ongoing", "second"]);
  });

  it("sert un cycle à venir en même temps qu'un cycle en cours", () => {
    expect(idsAt([upcoming, ongoing], "2026-10-14")).toEqual(["ongoing", "upcoming"]);
  });

  it("écarte les cycles terminés dès qu'un autre court ou arrive", () => {
    expect(idsAt([past, ongoing], "2026-10-14")).toEqual(["ongoing"]);
    expect(idsAt([past, upcoming], "2026-10-20")).toEqual(["upcoming"]);
  });

  it("retombe sur le dernier cycle terminé, seul, quand plus rien ne court", () => {
    const older = { id: "older", startDate: "2026-08-03", weekCount: 2 };
    expect(idsAt([older, past], "2026-10-20")).toEqual(["past"]);
  });

  it("rend une liste vide, jamais null, quand il n'y a aucun cycle exploitable", () => {
    expect(selectVisiblePlans([], "2026-10-14")).toEqual([]);
    // Cycle sans semaine : aucune période, donc aucune époque → ignoré.
    expect(selectVisiblePlans([{ id: "empty", startDate: MONDAY, weekCount: 0 }], MONDAY)).toEqual(
      [],
    );
  });

  it("rend une liste vide sur une date illisible plutôt que de deviner une époque", () => {
    expect(selectVisiblePlans([ongoing], "pas-une-date")).toEqual([]);
  });

  it("départage par l'id deux cycles partant le même lundi (ordre stable)", () => {
    const b = { id: "b", startDate: MONDAY, weekCount: 4 };
    const a = { id: "a", startDate: MONDAY, weekCount: 4 };
    expect(idsAt([b, a], "2026-10-14")).toEqual(["a", "b"]);
  });

  it("range les cycles en cours avant ceux à venir, chacun par date de début croissante", () => {
    const later = { id: "later", startDate: "2026-12-07", weekCount: 2 };
    expect(idsAt([later, upcoming, second, ongoing], "2026-10-20")).toEqual([
      "ongoing",
      "second",
      "upcoming",
      "later",
    ]);
  });

  it("s'accorde avec selectCurrentPlan : le résumé est TOUJOURS l'un des cycles visibles", () => {
    for (const today of ["2026-09-14", "2026-10-14", "2026-10-20", "2026-11-10", "2026-12-25"]) {
      const visible = idsAt([past, ongoing, second, upcoming], today);
      const current = selectCurrentPlan([past, ongoing, second, upcoming], today);
      expect(visible).toContain(current?.id);
    }
  });
});

describe("planAudience", () => {
  const of = (
    id: string,
    startDate: string,
    weekCount: number,
    status: PlanStatus = PlanStatus.PUBLISHED,
  ) => ({ id, athleteId: "ath_lea", startDate, weekCount, status });

  const ongoing = of("ongoing", MONDAY, 4); // 2026-10-12 → 2026-11-08
  const alsoOngoing = of("also", "2026-10-19", 3); // → 2026-11-08
  const upcoming = of("upcoming", "2026-11-09", 4);
  const ended = of("ended", "2026-08-31", 2); // → 2026-09-13

  it("un brouillon n'est vu de personne, quelle que soit sa date", () => {
    const draft = of("draft", MONDAY, 4, PlanStatus.DRAFT);
    expect(planAudience(draft, [draft], "2026-10-14")).toEqual({ kind: "NOT_PUBLISHED" });
  });

  it("un cycle en cours et seul à l'être : l'athlète le voit, sans rien d'autre", () => {
    expect(planAudience(ongoing, [ongoing], "2026-10-14")).toEqual({ kind: "VISIBLE_ALONE" });
  });

  // Ce que #172 rend possible : deux cycles menés de front, et le coach doit le savoir.
  it("nomme les autres cycles que l'athlète mène en parallèle", () => {
    expect(planAudience(ongoing, [ongoing, alsoOngoing], "2026-10-20")).toEqual({
      kind: "VISIBLE_WITH",
      otherPlanIds: ["also"],
    });
  });

  it("un cycle à venir est VISIBLE, et annonce sa date de début", () => {
    expect(planAudience(upcoming, [ongoing, upcoming], "2026-10-14")).toEqual({
      kind: "VISIBLE_UPCOMING",
      startDate: "2026-11-09",
    });
  });

  it("un cycle terminé que d'autres ont remplacé nomme ce que l'athlète suit désormais", () => {
    expect(planAudience(ended, [ended, ongoing], "2026-10-14")).toEqual({
      kind: "ENDED_SUPERSEDED",
      insteadPlanIds: ["ongoing"],
    });
  });

  // Le repli de `selectVisiblePlans` : sans suite, l'athlète voit encore son dernier cycle.
  it("un cycle terminé sans rien derrière reste vu de l'athlète", () => {
    expect(planAudience(ended, [ended], "2026-10-14")).toEqual({ kind: "ENDED_LAST" });
  });

  it("ignore les cycles d'un AUTRE athlète, même passés dans la même liste", () => {
    const somebodyElse = { ...of("other", MONDAY, 4), athleteId: "ath_adrien" };
    expect(planAudience(ongoing, [ongoing, somebodyElse], "2026-10-14")).toEqual({
      kind: "VISIBLE_ALONE",
    });
  });

  it("ignore les brouillons des voisins : personne ne les suit", () => {
    const draft = of("draft", "2026-10-19", 3, PlanStatus.DRAFT);
    expect(planAudience(ongoing, [ongoing, draft], "2026-10-20")).toEqual({
      kind: "VISIBLE_ALONE",
    });
  });

  /**
   * Le repli interdit : sur un cycle non situable, dire « il le voit » est exactement le défaut
   * qu'on corrige — une affirmation vraie par défaut plutôt que par vérification.
   */
  it("rend null sur un cycle non situable, jamais « il le voit »", () => {
    const broken = of("broken", MONDAY, 0);
    expect(planAudience(broken, [broken], "2026-10-14")).toBeNull();
    expect(planAudience(ongoing, [ongoing], "pas-une-date")).toBeNull();
  });

  /**
   * L'invariant qui empêche le constructeur de mentir : ce que le bandeau annonce est exactement ce
   * que l'API sert. Les deux dérivent de `selectVisiblePlans`, et ce test tient le lien.
   */
  it("ne dit « visible » que pour les cycles que selectVisiblePlans sert vraiment", () => {
    const all = [ended, ongoing, alsoOngoing, upcoming];
    for (const today of ["2026-09-07", "2026-10-14", "2026-10-20", "2026-11-20"]) {
      const served = selectVisiblePlans(all, today).map((item) => item.id);
      for (const candidate of all) {
        const audience = planAudience(candidate, all, today);
        if (audience == null) continue;
        const claimsVisible = audience.kind.startsWith("VISIBLE") || audience.kind === "ENDED_LAST";
        expect(claimsVisible).toBe(served.includes(candidate.id));
      }
    }
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

  // Écrit pour PERSONNE (#144) n'est pas écrit pour soi : les confondre rouvrirait la facturation
  // d'un cycle qui n'a personne à facturer.
  it("ne prend pas un cycle sans destinataire pour un cycle solo", () => {
    expect(isSelfCoached({ coachId: "u1", athleteId: null })).toBe(false);
  });
});

describe("planState", () => {
  const DRAFT = { status: PlanStatus.DRAFT, startDate: "2026-07-13", weekCount: 8 };
  const PUBLISHED = { ...DRAFT, status: PlanStatus.PUBLISHED };

  it("un brouillon est un brouillon, quelle que soit sa date", () => {
    // Daté de l'an prochain, il n'est pourtant pas « à venir » : il n'est promis à personne.
    expect(planState({ ...DRAFT, startDate: "2027-01-04" }, "2026-09-09")).toBe("DRAFT");
    expect(planState(DRAFT, "2026-09-09")).toBe("DRAFT");
  });

  it("un cycle diffusé prend son époque", () => {
    expect(planState(PUBLISHED, "2026-06-01")).toBe("UPCOMING");
    expect(planState(PUBLISHED, "2026-08-01")).toBe("ONGOING");
    expect(planState(PUBLISHED, "2026-10-01")).toBe("ENDED");
  });

  it("n'invente pas d'état sur un cycle non situable", () => {
    expect(planState({ ...PUBLISHED, weekCount: 0 }, "2026-09-09")).toBeNull();
  });

  it("chaque état a sa couleur, et « en cours » porte l'accent", () => {
    expect(PLAN_STATE_BADGE.ONGOING).toBe("accent");
    for (const state of PLAN_STATES) expect(PLAN_STATE_BADGE[state]).toBeTruthy();
  });
});
