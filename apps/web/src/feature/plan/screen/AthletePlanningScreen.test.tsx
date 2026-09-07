import type { PlanDto, PlanWeekDto, ScheduledSessionSummaryDto } from "@cmv/shared";
import {
  mondayOfIsoWeek,
  PlanStatus,
  PlanWeekType,
  ScheduledSessionStatus,
  shiftIsoDate,
  todayIsoDate,
} from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMyCoach } from "@/feature/coach";
import { useMyPlans } from "@/feature/plan/hook/useMyPlan";
import { AthletePlanningScreen } from "@/feature/plan/screen/AthletePlanningScreen";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/plan/hook/useMyPlan", () => ({ useMyPlans: vi.fn() }));
vi.mock("@/feature/coach", () => ({ useMyCoach: vi.fn() }));
/**
 * `CmvAppShell` importe `authClient`, et `@/shared/lib/auth` CRÉE ce client au chargement du
 * module — même quand l'AppShell est remplacé juste en dessous, l'`importOriginal` évalue le
 * graphe entier. Le client réel arme alors un temporisateur de session (nanostores) qui survit à
 * la destruction du jsdom : quand il se déclenche, `window` n'existe plus et Vitest compte une
 * erreur NON GÉRÉE — la suite entière échoue avec 519 tests verts.
 *
 * C'est ce qui a rendu la CI rouge sans qu'aucun test ne tombe. Tous les autres écrans posent déjà
 * ce mock ; ces deux fichiers étaient les seuls à l'omettre.
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

/** Les cycles sont datés depuis le lundi RÉEL : « aujourd'hui » tombe alors en semaine 1. */
const THIS_MONDAY = mondayOfIsoWeek(todayIsoDate()) ?? "2026-10-12";
const nextMonday = (weeks: number) => shiftIsoDate(THIS_MONDAY, weeks * 7) ?? THIS_MONDAY;

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
  exerciseCount: 3,
});

function week(
  weekNumber: number,
  startDate: string,
  sessions: ScheduledSessionSummaryDto[],
  note: string | null = null,
): PlanWeekDto {
  return {
    id: `pw_${weekNumber}`,
    weekNumber,
    type: PlanWeekType.TRAINING,
    note,
    startDate,
    endDate: shiftIsoDate(startDate, 6) ?? startDate,
    sessions,
  };
}

function plan(id: string, title: string, weeks: PlanWeekDto[]): PlanDto {
  return {
    id,
    coachId: "coach_1",
    athleteId: "ath_1",
    athleteName: "Léa Moreau",
    athleteEmail: "lea@example.test",
    title,
    description: null,
    startDate: weeks[0]?.startDate ?? THIS_MONDAY,
    status: PlanStatus.PUBLISHED,
    publishedAt: "2026-10-01T10:00:00Z",
    weekCount: weeks.length,
    sessionCount: weeks.flatMap((w) => w.sessions).length,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    weeks,
  };
}

const BLOC = plan("p_bloc", "Cycle Bloc", [
  week(1, THIS_MONDAY, [session("ss_bloc", "Force max", THIS_MONDAY)], "Montée en charge"),
  week(2, nextMonday(1), []),
]);
const FALAISE = plan("p_falaise", "Prépa falaise", [
  week(1, THIS_MONDAY, [session("ss_falaise", "Voie longue", THIS_MONDAY)]),
]);

type QueryState = { data?: PlanDto[] | undefined; isPending?: boolean; isError?: boolean };

const mount = async (state: QueryState, search: Record<string, string> = {}) => {
  vi.mocked(useMyPlans).mockReturnValue({
    data: state.data,
    isPending: state.isPending ?? false,
    isError: state.isError ?? false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMyPlans>);

  return renderInRoute(<AthletePlanningScreen />, {
    path: "/planning",
    links: ["/sessions/$sessionId"],
    search,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useMyCoach).mockReturnValue({ data: { id: "coach_1" } } as unknown as ReturnType<
    typeof useMyCoach
  >);
});

describe("AthletePlanningScreen", () => {
  it("attend la réponse avant de conclure quoi que ce soit", async () => {
    const { getByText } = await mount({ isPending: true });
    expect(getByText("common.loading")).toBeInTheDocument();
  });

  // Une panne réseau n'est pas « aucun cycle » : la seconde inviterait à attendre son coach.
  it("distingue la panne de l'absence de cycle", async () => {
    const { getByText } = await mount({ isError: true, data: undefined });
    expect(getByText("common.errorTitle")).toBeInTheDocument();
  });

  it("dit à l'athlète sans coach que c'est un coach qui lui manque, pas un cycle", async () => {
    vi.mocked(useMyCoach).mockReturnValue({ data: null } as unknown as ReturnType<
      typeof useMyCoach
    >);
    const { getByText } = await mount({ data: [] });
    expect(getByText("coach.missing.title")).toBeInTheDocument();
  });

  it("dit à l'athlète rattaché que son coach n'a rien diffusé", async () => {
    const { getByText } = await mount({ data: [] });
    expect(getByText("plan.athlete.empty.title")).toBeInTheDocument();
  });

  /**
   * Le cœur de #172 : deux cycles courent, l'athlète les voit tous les deux — et la semaine porte
   * les séances des deux.
   */
  it("annonce les DEUX cycles en cours au-dessus de la grille", async () => {
    const { getAllByText, getByText } = await mount({ data: [BLOC, FALAISE] });

    // Deux occurrences par cycle, et c'est voulu : la ligne du haut dit ce qui court, l'étiquette
    // de la carte dit d'où vient LA séance — sans elle, deux séances du même jour se confondent.
    expect(getAllByText("Cycle Bloc")).toHaveLength(2);
    expect(getAllByText("Prépa falaise")).toHaveLength(2);
    expect(getByText("Force max")).toBeInTheDocument();
    expect(getByText("Voie longue")).toBeInTheDocument();
  });

  it("reprend la note de la semaine du cycle auquel elle appartient", async () => {
    const { getByText } = await mount({ data: [BLOC] });
    expect(getByText("Montée en charge")).toBeInTheDocument();
  });

  /**
   * « Hors cycle » et « semaine de repos » sont contraires : sans cette phrase, une semaine que
   * plus aucun cycle ne couvre se lirait comme une semaine sans séance prévue.
   */
  it("dit quand aucun cycle n'a cours sur la semaine consultée", async () => {
    const { getByText, queryByText } = await mount(
      { data: [FALAISE] },
      { from: nextMonday(3) as string },
    );

    expect(getByText("plan.athlete.outOfCycle")).toBeInTheDocument();
    expect(queryByText("Voie longue")).toBeNull();
  });

  it("ouvre la semaine demandée par l'URL plutôt que celle d'aujourd'hui", async () => {
    const { getByText, queryByText } = await mount(
      { data: [BLOC] },
      { from: nextMonday(1) as string },
    );

    // La semaine 2 est vide : sa seule séance vit en semaine 1. Un seul cycle : son nom n'est
    // écrit qu'une fois, en tête — l'étiquette de carte ne distinguerait rien.
    expect(queryByText("Force max")).toBeNull();
    expect(getByText("Cycle Bloc")).toBeInTheDocument();
  });

  // Sans bornes, l'athlète parcourt indéfiniment des semaines vides qui ne lui apprennent rien.
  it("borne la navigation à la plage réelle des cycles servis", async () => {
    const { getByText } = await mount({ data: [FALAISE] });

    expect(getByText("plan.athlete.week.previous")).toBeDisabled();
    expect(getByText("plan.athlete.week.next")).toBeDisabled();
  });

  it("laisse avancer tant qu'il reste une semaine devant", async () => {
    const { getByText } = await mount({ data: [BLOC] });
    expect(getByText("plan.athlete.week.next")).toBeEnabled();
  });
});
