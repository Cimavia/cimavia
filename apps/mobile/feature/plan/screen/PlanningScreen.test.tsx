import type { AthleteCalendarWeek, PlanDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import {
  athleteCalendarWeek,
  mondayOfIsoWeek,
  PlanStatus,
  PlanWeekType,
  ScheduledSessionStatus,
  shiftIsoDate,
  todayIsoDate,
} from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMyCoach } from "@/feature/coach";
import { CurrentWeekSection } from "@/feature/plan/component/CurrentWeekSection";
import { PlanWeekList } from "@/feature/plan/component/PlanWeekList";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import { PlanningScreen, resolvePlanningState } from "@/feature/plan/screen/PlanningScreen";
import { renderRn } from "@/test/render";

vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useMyPlans: vi.fn() }));
vi.mock("@/feature/coach", () => ({ useMyCoach: vi.fn() }));
// Le bandeau hors-ligne écoute l'état réseau : hors sujet ici.
vi.mock("@/shared/component/OfflineBanner", () => ({ OfflineBanner: () => null }));

const MONDAY = mondayOfIsoWeek(todayIsoDate()) ?? "2026-10-12";
const WEDNESDAY = shiftIsoDate(MONDAY, 2) ?? MONDAY;

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

function plan(
  id: string,
  title: string,
  sessions: ScheduledSessionSummaryDto[],
  { startDate = MONDAY, note = null }: { startDate?: string; note?: string | null } = {},
): PlanDto {
  return {
    id,
    coachId: "coach_1",
    athleteId: "ath_1",
    athleteName: "Léa Moreau",
    athleteEmail: "lea@example.test",
    title,
    description: null,
    startDate,
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
        note,
        startDate,
        endDate: shiftIsoDate(startDate, 6) ?? startDate,
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

/**
 * L'écran complet, une fois les six cas résolus : ce qui s'éprouve ici est le CÂBLAGE — que chaque
 * état atteigne bien le bloc qui lui correspond, et que la semaine montrée soit celle d'aujourd'hui.
 */
describe("PlanningScreen", () => {
  const mount = (
    data: PlanDto[] | undefined,
    over: { isPending?: boolean; isError?: boolean } = {},
  ) => {
    vi.mocked(useMyPlans).mockReturnValue({
      data,
      isPending: over.isPending ?? false,
      isError: over.isError ?? false,
      isRefetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useMyPlans>);
    return renderRn(<PlanningScreen />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMyCoach).mockReturnValue({ data: { id: "coach_1" } } as unknown as ReturnType<
      typeof useMyCoach
    >);
  });

  it("dit à l'athlète sans coach que c'est un coach qui lui manque", () => {
    vi.mocked(useMyCoach).mockReturnValue({ data: null } as unknown as ReturnType<
      typeof useMyCoach
    >);
    expect(mount([]).getByText("coach.missing.title")).toBeTruthy();
  });

  it("dit à l'athlète rattaché que son coach n'a rien diffusé", () => {
    expect(mount([]).getByText("plan.empty.title")).toBeTruthy();
  });

  it("dit quand aucun cycle n'a cours cette semaine, plutôt que sept lignes de repos", () => {
    const past = shiftIsoDate(MONDAY, -70) ?? MONDAY;
    const ended = plan("p_vieux", "Cycle fini", [], { startDate: past });

    expect(mount([ended]).getByText("plan.outOfCycle")).toBeTruthy();
  });

  it("montre la semaine en cours, séances des deux cycles comprises", () => {
    const { getByText } = mount([BLOC, FALAISE]);

    expect(getByText("plan.thisWeek")).toBeTruthy();
    expect(getByText("Force max")).toBeTruthy();
    expect(getByText("Voie longue")).toBeTruthy();
  });
});

/** L'en-tête de la semaine et le bandeau des cycles en cours. */
describe("CurrentWeekSection", () => {
  it("annonce chaque cycle en cours, avec sa note de semaine", () => {
    const noted = plan("p_bloc", "Cycle Bloc", [session("ss_bloc", "Force max", WEDNESDAY)], {
      note: "Montée en charge",
    });
    const { getAllByText, getByText } = renderRn(
      <CurrentWeekSection week={weekOf([noted, FALAISE])} today={MONDAY} />,
    );

    // Deux occurrences par cycle, et c'est voulu : le bandeau dit ce qui court, l'étiquette de la
    // carte dit d'où vient LA séance — sans elle, deux séances du même jour se confondent.
    expect(getAllByText("Cycle Bloc")).toHaveLength(2);
    expect(getAllByText("Prépa falaise")).toHaveLength(2);
    expect(getByText("Montée en charge")).toBeTruthy();
  });

  it("titre la semaine et compte ses séances faites", () => {
    const { getByText } = renderRn(<CurrentWeekSection week={weekOf([BLOC])} today={MONDAY} />);

    expect(getByText("plan.thisWeek")).toBeTruthy();
    expect(getByText(/plan\.doneCount/)).toBeTruthy();
  });
});
