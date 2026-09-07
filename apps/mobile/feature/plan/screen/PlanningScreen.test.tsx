import type { AthleteCalendarWeek, PlanDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import { athleteCalendarWeek, PlanStatus, PlanWeekType, ScheduledSessionStatus } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { PlanWeekList } from "@/feature/plan/component/PlanWeekList";
import { resolvePlanningState } from "@/feature/plan/screen/PlanningScreen";
import { renderRn } from "@/test/render";

const MONDAY = "2026-10-12";
const WEDNESDAY = "2026-10-14";

const session = (id: string, title: string, scheduledDate: string): ScheduledSessionSummaryDto => ({
  id,
  planId: "p_1",
  planWeekId: "pw_1",
  sourceSessionId: null,
  title,
  notes: null,
  scheduledDate,
  position: 0,
  status: ScheduledSessionStatus.PLANNED,
  exerciseCount: 2,
});

function plan(id: string, title: string, sessions: ScheduledSessionSummaryDto[]): PlanDto {
  return {
    id,
    coachId: "coach_1",
    athleteId: "ath_1",
    athleteName: "Léa Moreau",
    athleteEmail: "lea@example.test",
    title,
    description: null,
    startDate: MONDAY,
    status: PlanStatus.PUBLISHED,
    publishedAt: "2026-10-01T10:00:00Z",
    weekCount: 1,
    sessionCount: sessions.length,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    weeks: [
      {
        id: "pw_1",
        weekNumber: 1,
        type: PlanWeekType.TRAINING,
        note: null,
        startDate: MONDAY,
        endDate: "2026-10-18",
        sessions,
      },
    ],
  };
}

const BLOC = plan("p_bloc", "Cycle Bloc", [session("ss_bloc", "Force max", WEDNESDAY)]);
const FALAISE = plan("p_falaise", "Prépa falaise", [session("ss_fal", "Voie longue", WEDNESDAY)]);

function weekOf(plans: PlanDto[]): AthleteCalendarWeek<ScheduledSessionSummaryDto> {
  const week = athleteCalendarWeek(plans, MONDAY);
  if (week == null) throw new Error("[test] semaine civile non composable");
  return week;
}

/**
 * Les six cas de l'écran, éprouvés sur la fonction plutôt qu'au rendu : ce sont des DÉCISIONS
 * (« sans coach » ≠ « coach sans cycle », « hors cycle » ≠ « semaine de repos »), et chacune se
 * lirait pareil à l'écran si elle était fausse — zéro séance des deux côtés.
 */
describe("resolvePlanningState", () => {
  const week = weekOf([BLOC]);

  it("attend la réponse avant de conclure quoi que ce soit", () => {
    expect(resolvePlanningState(true, false, undefined, true, null).kind).toBe("loading");
  });

  it("distingue la panne de l'absence de coach, sur la même donnée manquante", () => {
    expect(resolvePlanningState(false, true, undefined, true, null).kind).toBe("error");
    expect(resolvePlanningState(false, false, undefined, false, null).kind).toBe("noCoach");
  });

  // Dire à un athlète non rattaché que son coach n'a rien diffusé le laisserait attendre pour rien.
  it("sépare l'athlète sans coach de celui dont le coach n'a rien diffusé", () => {
    expect(resolvePlanningState(false, false, [], false, null).kind).toBe("noCoach");
    expect(resolvePlanningState(false, false, [], true, null).kind).toBe("noPlan");
  });

  /**
   * L'invariant de #172 : des cycles existent, mais aucun ne couvre la semaine en cours. Sept
   * lignes de « Repos » diraient l'inverse — que le cycle prévoit du repos.
   */
  it("distingue « aucun cycle cette semaine » d'une semaine sans séance", () => {
    const horsCycle = weekOf([]);
    expect(resolvePlanningState(false, false, [BLOC], true, horsCycle).kind).toBe("outOfCycle");
    expect(resolvePlanningState(false, false, [BLOC], true, week).kind).toBe("week");
  });

  it("retombe sur « hors cycle » quand la semaine n'est pas composable", () => {
    expect(resolvePlanningState(false, false, [BLOC], true, null).kind).toBe("outOfCycle");
  });
});

describe("PlanWeekList", () => {
  it("réunit dans le même jour les séances de deux cycles, chacune nommée", () => {
    const { getByText } = renderRn(<PlanWeekList week={weekOf([BLOC, FALAISE])} today={MONDAY} />);

    expect(getByText("Force max")).toBeTruthy();
    expect(getByText("Voie longue")).toBeTruthy();
    expect(getByText("Cycle Bloc")).toBeTruthy();
    expect(getByText("Prépa falaise")).toBeTruthy();
  });

  // L'étiquette DISTINGUE ; répétée sur chaque carte d'un cycle unique, elle ne distingue rien et
  // encombre un écran étroit.
  it("tait le nom du cycle quand il n'y en a qu'un", () => {
    const { queryByText } = renderRn(<PlanWeekList week={weekOf([BLOC])} today={MONDAY} />);

    expect(queryByText("Cycle Bloc")).toBeNull();
    expect(queryByText("Force max")).toBeTruthy();
  });

  it("affiche les sept jours, « Repos » sur ceux qui n'ont rien", () => {
    const { getAllByText } = renderRn(<PlanWeekList week={weekOf([BLOC])} today={MONDAY} />);
    expect(getAllByText("plan.rest")).toHaveLength(6);
  });
});
