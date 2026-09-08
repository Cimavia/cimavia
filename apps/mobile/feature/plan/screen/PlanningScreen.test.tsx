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
import { press, renderRn } from "@/test/render";

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

/**
 * Un cycle tel que l'API le sert : `weekCount` semaines consécutives depuis `startDate`, chacune
 * garnie des séances qui tombent dans SA plage — la même répartition que côté serveur, sinon un
 * test naviguerait vers une semaine que `athleteCalendarWeek` déclarerait vide.
 */
function plan(
  id: string,
  title: string,
  sessions: ScheduledSessionSummaryDto[],
  {
    startDate = MONDAY,
    note = null,
    weekCount = 1,
  }: { startDate?: string; note?: string | null; weekCount?: number } = {},
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
    weekCount,
    sessionCount: sessions.length,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    weeks: Array.from({ length: weekCount }, (_, index) => {
      const weekStart = shiftIsoDate(startDate, index * 7) ?? startDate;
      const weekEnd = shiftIsoDate(weekStart, 6) ?? weekStart;
      return {
        id: `pw_${index + 1}`,
        weekNumber: index + 1,
        type: PlanWeekType.TRAINING,
        note: index === 0 ? note : null,
        startDate: weekStart,
        endDate: weekEnd,
        sessions: sessions.filter(
          (session) => session.scheduledDate >= weekStart && session.scheduledDate <= weekEnd,
        ),
      };
    }),
  };
}

const BLOC = plan("p_bloc", "Cycle Bloc", [session("ss_bloc", "Force max", WEDNESDAY)]);
const FALAISE = plan("p_falaise", "Prépa falaise", [session("ss_fal", "Voie longue", WEDNESDAY)]);

const NEXT_MONDAY = shiftIsoDate(MONDAY, 7) ?? MONDAY;
const NEXT_WEDNESDAY = shiftIsoDate(WEDNESDAY, 7) ?? WEDNESDAY;

/**
 * `react-native-web` rend un `Pressable` désactivé en vrai `<button disabled aria-disabled>` :
 * c'est l'attribut qu'on interroge, faute de `toBeDisabled` — le harnais mobile ne charge pas
 * `@testing-library/jest-dom`, là où celui du web le fait (`apps/web/vitest.setup.ts`).
 */
const isClosed = (element: HTMLElement) => element.getAttribute("aria-disabled") === "true";

function weekOf(plans: PlanDto[]): AthleteCalendarWeek<ScheduledSessionSummaryDto> {
  const week = athleteCalendarWeek(plans, MONDAY);
  if (week == null) throw new Error("[test] semaine civile non composable");
  return week;
}

/**
 * Les cinq cas de l'écran, éprouvés sur la fonction plutôt qu'au rendu : ce sont des DÉCISIONS
 * (« sans coach » ≠ « coach sans cycle »), et chacune se lirait pareil à l'écran si elle était
 * fausse — zéro séance des deux côtés.
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
   * Une semaine sans cycle N'EST PLUS un état à part depuis #236 : c'est une semaine comme une
   * autre, que la navigation peut atteindre et qui garde donc ses commandes. Ce qui la distingue
   * d'une semaine de repos — `cycles` vide — se dit au RENDU, pas ici.
   */
  it("traite la semaine hors cycle comme une semaine, pas comme un cul-de-sac", () => {
    const horsCycle = weekOf([]);
    expect(resolvePlanningState(false, false, [BLOC], true, horsCycle).kind).toBe("week");
    expect(resolvePlanningState(false, false, [BLOC], true, week).kind).toBe("week");
  });

  // Des cycles existent mais aucun n'est situable : il n'y a aucune semaine à parcourir, donc rien
  // que des commandes fermées à montrer. L'état vide en dit autant, et le dit mieux.
  it("retombe sur l'état vide quand aucune semaine n'est situable", () => {
    expect(resolvePlanningState(false, false, [BLOC], true, null).kind).toBe("noPlan");
    expect(resolvePlanningState(false, false, [BLOC], false, null).kind).toBe("noCoach");
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
 * L'écran complet, une fois les cinq cas résolus : ce qui s'éprouve ici est le CÂBLAGE — que chaque
 * état atteigne le bloc qui lui correspond, et que la NAVIGATION mène bien où elle prétend (#236).
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

  it("montre la semaine en cours, séances des deux cycles comprises", () => {
    const { getByText } = mount([BLOC, FALAISE]);

    expect(getByText("Force max")).toBeTruthy();
    expect(getByText("Voie longue")).toBeTruthy();
  });

  /**
   * Le geste du dimanche soir : le cycle commence demain. Avant #236 l'écran répondait « aucun de
   * tes cycles n'a cours » tout le week-end, sans aucun moyen de regarder devant.
   */
  it("ouvre la première semaine du cycle à venir, au lieu d'un écran muet", () => {
    const soon = plan(
      "p_soon",
      "Reprise",
      [session("ss_soon", "Réathlétisation", NEXT_WEDNESDAY)],
      {
        startDate: NEXT_MONDAY,
      },
    );
    const { getByText, queryByText } = mount([soon]);

    expect(getByText("Réathlétisation")).toBeTruthy();
    expect(queryByText("plan.outOfCycle")).toBeNull();
  });

  // Même repli quand plus rien ne court : le dernier cycle reçu vaut mieux qu'une semaine vide.
  it("ouvre le dernier cycle reçu quand aucun n'a plus cours", () => {
    const past = shiftIsoDate(MONDAY, -70) ?? MONDAY;
    const ended = plan("p_vieux", "Cycle fini", [session("ss_fini", "Bloc long", past)], {
      startDate: past,
    });

    expect(mount([ended]).getByText("Bloc long")).toBeTruthy();
  });

  it("avance d'une semaine, puis revient", () => {
    const { getByRole, getByText, queryByText } = mount([
      plan(
        "p_deux",
        "Cycle deux semaines",
        [session("ss_s1", "Force max", WEDNESDAY), session("ss_s2", "Voie longue", NEXT_WEDNESDAY)],
        { weekCount: 2 },
      ),
    ]);

    press(getByRole("button", { name: "plan.week.next" }));
    expect(getByText("Voie longue")).toBeTruthy();
    expect(queryByText("Force max")).toBeNull();

    press(getByRole("button", { name: "plan.week.previous" }));
    expect(getByText("Force max")).toBeTruthy();
  });

  // Sans bornes, l'athlète défilerait indéfiniment des semaines vides qui ne lui apprennent rien.
  it("ferme la commande qui sortirait des cycles servis", () => {
    const { getByRole } = mount([plan("p_deux", "Deux semaines", [], { weekCount: 2 })]);

    expect(isClosed(getByRole("button", { name: "plan.week.previous" }))).toBe(true);
    press(getByRole("button", { name: "plan.week.next" }));
    expect(isClosed(getByRole("button", { name: "plan.week.next" }))).toBe(true);
  });

  // Fermé au départ : il n'y a nulle part d'où revenir tant qu'on n'a pas bougé.
  it("ramène au défaut, et s'y ferme", () => {
    const { getByRole, getByText } = mount([
      plan("p_deux", "Deux semaines", [session("ss_s1", "Force max", WEDNESDAY)], { weekCount: 2 }),
    ]);

    expect(isClosed(getByRole("button", { name: "plan.week.today" }))).toBe(true);

    press(getByRole("button", { name: "plan.week.next" }));
    press(getByRole("button", { name: "plan.week.today" }));

    expect(getByText("Force max")).toBeTruthy();
    expect(isClosed(getByRole("button", { name: "plan.week.today" }))).toBe(true);
  });

  /**
   * Le cul-de-sac que #236 ferme : atteinte par la navigation, une semaine sans cycle doit garder
   * ses sept jours ET ses commandes. Les perdre laissait l'athlète coincé là où « suivant » l'avait
   * mené.
   */
  it("garde ses sept jours et ses commandes sur une semaine hors cycle", () => {
    const later = shiftIsoDate(MONDAY, 14) ?? MONDAY;
    const { getAllByText, getByRole, getByText } = mount([
      BLOC,
      plan("p_apres", "Cycle d'après", [session("ss_apres", "Falaise", later)], {
        startDate: later,
      }),
    ]);

    press(getByRole("button", { name: "plan.week.next" }));

    expect(getByText("plan.outOfCycle")).toBeTruthy();
    expect(getAllByText("plan.rest")).toHaveLength(7);
    expect(isClosed(getByRole("button", { name: "plan.week.next" }))).toBe(false);
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

  // Le bandeau des cycles ne s'écrit que s'il a quelque chose à annoncer : sur une semaine hors
  // cycle, la phrase de l'écran dit déjà la situation et un cadre vide n'ajouterait rien.
  it("ne pose aucun cadre quand aucun cycle n'a cours", () => {
    const { getAllByText, queryByText } = renderRn(
      <CurrentWeekSection week={weekOf([])} today={MONDAY} />,
    );

    expect(queryByText(/plan\.cycle\.week/)).toBeNull();
    expect(getAllByText("plan.rest")).toHaveLength(7);
  });
});
