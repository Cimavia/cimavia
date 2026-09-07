import { describe, expect, it } from "vitest";
import { PlanWeekType } from "../dto/plan.schema";
import {
  athleteCalendarBounds,
  athleteCalendarWeek,
  type CalendarPlan,
  type CalendarSession,
  defaultAthleteMonday,
} from "./athlete-week.util";

// 2026-10-12 est un lundi. Les semaines suivantes : 19, 26, puis 2026-11-02.
const MONDAY = "2026-10-12";

type Session = CalendarSession & { id: string };

const session = (id: string, scheduledDate: string, position = 0): Session => ({
  id,
  scheduledDate,
  position,
});

/** Un cycle dont les semaines sont dérivées comme l'API les sert : une par semaine, depuis le lundi. */
function plan(
  id: string,
  title: string,
  startDate: string,
  weeks: { type?: PlanWeekType; note?: string | null; sessions?: Session[] }[],
): CalendarPlan<Session> {
  return {
    id,
    title,
    startDate,
    weekCount: weeks.length,
    weeks: weeks.map((week, index) => {
      const monday = new Date(`${startDate}T00:00:00Z`);
      monday.setUTCDate(monday.getUTCDate() + index * 7);
      return {
        weekNumber: index + 1,
        type: week.type ?? PlanWeekType.TRAINING,
        note: week.note ?? null,
        startDate: monday.toISOString().slice(0, 10),
        sessions: week.sessions ?? [],
      };
    }),
  };
}

const BLOC = plan("bloc", "Cycle Bloc", MONDAY, [
  { sessions: [session("bloc-lun", MONDAY), session("bloc-mer", "2026-10-14")] },
  { type: PlanWeekType.DELOAD, note: "Décharge", sessions: [session("bloc-s2", "2026-10-20")] },
]);

// Démarre le même lundi que BLOC : c'est l'accumulation, le cas que #172 servait à moitié.
const FALAISE = plan("falaise", "Prépa falaise", MONDAY, [
  { sessions: [session("falaise-lun", MONDAY, 1), session("falaise-jeu", "2026-10-15")] },
]);

describe("athleteCalendarWeek", () => {
  it("rend toujours les 7 jours, du lundi au dimanche", () => {
    const week = athleteCalendarWeek([BLOC], MONDAY);
    expect(week?.days.map((day) => day.date)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(week?.endDate).toBe("2026-10-18");
  });

  it("réunit dans le MÊME jour les séances de deux cycles concurrents", () => {
    const week = athleteCalendarWeek([BLOC, FALAISE], MONDAY);
    const lundi = week?.days[0];
    expect(lundi?.entries.map((entry) => entry.session.id)).toEqual(["bloc-lun", "falaise-lun"]);
  });

  it("étiquette chaque séance de son cycle — sans quoi elles sont indiscernables", () => {
    const week = athleteCalendarWeek([BLOC, FALAISE], MONDAY);
    expect(week?.days[0]?.entries.map((entry) => entry.planTitle)).toEqual([
      "Cycle Bloc",
      "Prépa falaise",
    ]);
    expect(week?.days[0]?.entries[1]?.planId).toBe("falaise");
  });

  it("range par cycle d'abord, puis par position dans la journée", () => {
    const deux = plan("deux", "Deux le mardi", MONDAY, [
      { sessions: [session("tard", "2026-10-13", 1), session("tot", "2026-10-13", 0)] },
    ]);
    const week = athleteCalendarWeek([deux], MONDAY);
    expect(week?.days[1]?.entries.map((entry) => entry.session.id)).toEqual(["tot", "tard"]);
  });

  it("annonce les cycles qui couvrent la semaine, avec leur numéro et leur note", () => {
    const week = athleteCalendarWeek([BLOC, FALAISE], "2026-10-19");
    expect(week?.cycles).toEqual([
      {
        planId: "bloc",
        title: "Cycle Bloc",
        weekNumber: 2,
        weekCount: 2,
        type: PlanWeekType.DELOAD,
        note: "Décharge",
      },
    ]);
  });

  /**
   * L'invariant qui empêche l'écran de mentir : « aucun cycle » et « une semaine sans séance » ne
   * se rendent pas pareil, et seul `cycles` les sépare.
   */
  it("distingue la semaine hors cycle de la semaine de repos", () => {
    const horsCycle = athleteCalendarWeek([BLOC], "2026-11-02");
    expect(horsCycle?.cycles).toEqual([]);
    expect(horsCycle?.days.every((day) => day.entries.length === 0)).toBe(true);

    const repos = athleteCalendarWeek([plan("vide", "Sans séance", MONDAY, [{}])], MONDAY);
    expect(repos?.cycles).toHaveLength(1);
    expect(repos?.days.every((day) => day.entries.length === 0)).toBe(true);
  });

  it("rend null sur une date qui n'est pas un lundi lisible (pas de grille décalée)", () => {
    expect(athleteCalendarWeek([BLOC], "2026-10-13")).toBeNull();
    expect(athleteCalendarWeek([BLOC], "pas-une-date")).toBeNull();
    expect(athleteCalendarWeek([BLOC], "2026-02-31")).toBeNull();
  });

  it("rend une semaine vide, jamais null, quand aucun cycle n'est servi", () => {
    const week = athleteCalendarWeek([], MONDAY);
    expect(week?.days).toHaveLength(7);
    expect(week?.cycles).toEqual([]);
  });
});

describe("athleteCalendarBounds", () => {
  it("couvre du premier lundi du plus ancien au dernier lundi du plus tardif", () => {
    const tardif = plan("tardif", "Plus tard", "2026-11-09", [{}, {}]);
    expect(athleteCalendarBounds([BLOC, tardif])).toEqual({
      firstMonday: MONDAY,
      lastMonday: "2026-11-16",
    });
  });

  it("rend null sans cycle situable plutôt que d'ouvrir une navigation vide", () => {
    expect(athleteCalendarBounds([])).toBeNull();
    expect(athleteCalendarBounds([plan("vide", "Sans semaine", MONDAY, [])])).toBeNull();
  });
});

describe("defaultAthleteMonday", () => {
  it("ouvre la semaine d'aujourd'hui dès qu'un cycle a cours", () => {
    expect(defaultAthleteMonday([BLOC], "2026-10-21")).toBe("2026-10-19");
  });

  it("ouvre le début du cycle quand celui-ci n'a pas encore commencé", () => {
    expect(defaultAthleteMonday([BLOC], "2026-09-28")).toBe(MONDAY);
  });

  it("ouvre le début du dernier cycle terminé, plutôt qu'une semaine vide sans rapport", () => {
    expect(defaultAthleteMonday([BLOC], "2026-12-14")).toBe(MONDAY);
  });

  it("rend null sans cycle, ou sur une date illisible", () => {
    expect(defaultAthleteMonday([], "2026-10-14")).toBeNull();
    expect(defaultAthleteMonday([BLOC], "pas-une-date")).toBeNull();
  });
});
