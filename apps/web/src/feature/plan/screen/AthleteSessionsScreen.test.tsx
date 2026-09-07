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
import { AthleteSessionsScreen } from "@/feature/plan/screen/AthleteSessionsScreen";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useMyPlans: vi.fn() }));
/**
 * `CmvAppShell` importe `authClient`, et `@/shared/lib/auth` crée ce client au chargement du
 * module : le laisser vivre arme un temporisateur de session qui survit au jsdom et fait compter
 * à Vitest une erreur NON GÉRÉE, suite verte comprise.
 */
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "ath_1" } } }),
    signOut: () => Promise.resolve(),
  },
}));
// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({
    title,
    subtitle,
    children,
  }: Readonly<{ title: string; subtitle?: string; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {children as never}
    </div>
  ),
}));

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

type QueryState = { data?: PlanDto[] | undefined; isPending?: boolean; isError?: boolean };

const mount = async (state: QueryState, segment = "upcoming") => {
  vi.mocked(useMyPlans).mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMyPlans>);

  return renderInRoute(<AthleteSessionsScreen />, {
    path: "/sessions/",
    links: ["/sessions/$sessionId"],
    search: { segment },
  });
};

beforeEach(() => vi.clearAllMocks());

describe("AthleteSessionsScreen", () => {
  it("attend la réponse avant de conclure quoi que ce soit", async () => {
    const { getByText } = await mount({ isPending: true });
    expect(getByText("common.loading")).toBeInTheDocument();
  });

  // Une panne réseau n'est pas « aucune séance » : la seconde laisserait croire le cycle vide.
  it("distingue la panne de l'absence de séance", async () => {
    const { getByText } = await mount({ isError: true, data: undefined });
    expect(getByText("common.errorTitle")).toBeInTheDocument();
  });

  it("annonce l'absence de séance quand la période demandée est vide", async () => {
    const { getByText } = await mount({ data: [] });
    expect(getByText("plan.athlete.sessions.empty")).toBeInTheDocument();
  });

  it("ne montre que les séances à venir sous le segment « à venir »", async () => {
    const { getByText, queryByText } = await mount({ data: [BLOC] }, "upcoming");

    expect(getByText("Force max")).toBeInTheDocument();
    expect(queryByText("Mobilité")).toBeNull();
  });

  it("bascule sur les séances passées sous l'autre segment", async () => {
    const { getByText, queryByText } = await mount({ data: [BLOC] }, "past");

    expect(getByText("Mobilité")).toBeInTheDocument();
    expect(queryByText("Force max")).toBeNull();
  });

  // Le cœur de #172 : la liste agrège les cycles, elle n'en lit plus un seul.
  it("agrège les séances de TOUS les cycles servis, chacune nommée de son cycle", async () => {
    const { getByText } = await mount({ data: [BLOC, FALAISE] }, "upcoming");

    expect(getByText("Force max")).toBeInTheDocument();
    expect(getByText("Voie longue")).toBeInTheDocument();
    expect(getByText("Cycle Bloc")).toBeInTheDocument();
    expect(getByText("Prépa falaise")).toBeInTheDocument();
  });

  // L'étiquette DISTINGUE ; répétée sur chaque carte d'un cycle unique, elle ne distingue rien.
  it("tait le nom du cycle quand l'athlète n'en suit qu'un", async () => {
    const { queryByText } = await mount({ data: [BLOC] }, "upcoming");
    expect(queryByText("Cycle Bloc")).toBeNull();
  });
});
