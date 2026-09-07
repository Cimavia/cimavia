import type { PlanDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import {
  mondayOfIsoWeek,
  PlanStatus,
  PlanWeekType,
  ScheduledSessionStatus,
  shiftIsoDate,
  todayIsoDate,
} from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import { SessionsScreen } from "@/feature/plan/screen/SessionsScreen";
import { press, renderRn } from "@/test/render";

vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useMyPlans: vi.fn() }));
// Le bandeau hors-ligne écoute l'état réseau : hors sujet ici, et il n'a rien à dire d'un test.
vi.mock("@/shared/component/OfflineBanner", () => ({ OfflineBanner: () => null }));

const TODAY = todayIsoDate();
const THIS_MONDAY = mondayOfIsoWeek(TODAY) ?? "2026-10-12";
const shift = (days: number) => shiftIsoDate(TODAY, days) ?? TODAY;

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

const plan = (id: string, title: string, sessions: ScheduledSessionSummaryDto[]): PlanDto => ({
  id,
  coachId: "coach_1",
  athleteId: "ath_1",
  athleteName: "Léa Moreau",
  athleteEmail: "lea@example.test",
  title,
  description: null,
  startDate: THIS_MONDAY,
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
      startDate: THIS_MONDAY,
      endDate: shiftIsoDate(THIS_MONDAY, 6) ?? THIS_MONDAY,
      sessions,
    },
  ],
});

const BLOC = plan("p_bloc", "Cycle Bloc", [
  session("ss_demain", "Force max", shift(1)),
  session("ss_hier", "Mobilité", shift(-1)),
]);
const FALAISE = plan("p_falaise", "Prépa falaise", [session("ss_voie", "Voie longue", shift(2))]);

const mount = (
  data: PlanDto[] | undefined,
  over: { isPending?: boolean; isError?: boolean } = {},
) => {
  vi.mocked(useMyPlans).mockReturnValue({
    data,
    isPending: over.isPending ?? false,
    isError: over.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMyPlans>);

  return renderRn(<SessionsScreen />);
};

beforeEach(() => vi.clearAllMocks());

describe("SessionsScreen", () => {
  it("montre l'erreur quand la requête a échoué sans rien rendre", () => {
    expect(mount(undefined, { isError: true }).queryByText("common.errorTitle")).toBeTruthy();
  });

  // Hors-ligne, le cache sert encore les cycles : l'erreur n'a alors rien à dire.
  it("se tait sur une erreur dont le cache a quand même servi les cycles", () => {
    const { queryByText, getByText } = mount([BLOC], { isError: true });

    expect(queryByText("common.errorTitle")).toBeNull();
    expect(getByText("Force max")).toBeTruthy();
  });

  it("annonce l'absence de séance quand la période demandée est vide", () => {
    expect(mount([]).getByText("plan.sessions.empty")).toBeTruthy();
  });

  it("ouvre sur les séances à venir, et bascule sur les passées", async () => {
    const { getByText, queryByText } = mount([BLOC]);

    expect(getByText("Force max")).toBeTruthy();
    expect(queryByText("Mobilité")).toBeNull();

    await press(getByText("plan.sessions.past"));

    expect(getByText("Mobilité")).toBeTruthy();
    expect(queryByText("Force max")).toBeNull();
  });

  // Le cœur de #172 : la liste agrège les cycles, elle n'en lit plus un seul.
  it("agrège les séances de TOUS les cycles, chacune nommée de son cycle", () => {
    const { getByText } = mount([BLOC, FALAISE]);

    expect(getByText("Force max")).toBeTruthy();
    expect(getByText("Voie longue")).toBeTruthy();
    expect(getByText("Cycle Bloc")).toBeTruthy();
    expect(getByText("Prépa falaise")).toBeTruthy();
  });

  it("tait le nom du cycle quand l'athlète n'en suit qu'un", () => {
    expect(mount([BLOC]).queryByText("Cycle Bloc")).toBeNull();
  });
});
