import { mondayOfIsoWeek, type PlanSummaryDto, todayIsoDate } from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WEEK_COUNT } from "@/feature/plan/constant";
import { useCreatePlan, usePlans } from "@/feature/plan/hook/usePlans";
import { PlansScreen } from "@/feature/plan/screen/PlansScreen";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/plan/hook/usePlans", () => ({
  usePlans: vi.fn(),
  useCreatePlan: vi.fn(),
}));
// La liste résout le nom du destinataire par ces deux-là : leur transport a ses propres tests.
vi.mock("@/feature/athlete/hook/useAthletes", () => ({
  useAthletes: () => ({
    data: [{ athleteId: "ath_lea", athleteName: "Léa Moreau", isSelf: false }],
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach_1" } } }) },
}));
// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({
    title,
    actions,
    children,
  }: Readonly<{ title: string; actions?: unknown; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      {actions as never}
      {children as never}
    </div>
  ),
}));

const mutate = vi.fn();

const existingPlan: PlanSummaryDto = {
  id: "pln_1",
  coachId: "coach_1",
  athleteId: "ath_lea",
  athleteName: "Léa Moreau",
  athleteEmail: "lea@example.test",
  title: "Cycle bloc",
  description: null,
  startDate: "2026-10-19",
  status: "DRAFT",
  publishedAt: null,
  weekCount: 4,
  sessionCount: 12,
  createdAt: "2026-10-01T10:00:00Z",
  updatedAt: "2026-10-01T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCreatePlan).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<
    typeof useCreatePlan
  >);
});

const mount = async (plans: PlanSummaryDto[] = []) => {
  vi.mocked(usePlans).mockReturnValue({
    data: plans,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof usePlans>);

  return renderInRoute(<PlansScreen />, {
    path: "/plans",
    links: ["/plans/$planId"],
  });
};

/**
 * « Nouvelle planification » n'ouvre plus de panneau : elle crée le brouillon et ouvre le
 * constructeur (#207). Ce qui s'éprouve ici est donc CE QUI PART en base au premier clic — le
 * coach ne l'a pas saisi, l'écran l'a décidé pour lui, et il vivra ensuite dans son cycle.
 */
describe("PlansScreen — créer un cycle", () => {
  it("crée un brouillon de quatre semaines démarrant ce lundi, sans destinataire", async () => {
    const { getAllByText, user } = await mount();

    await user.click(getAllByText("plan.new")[0] as HTMLElement);

    expect(mutate.mock.calls[0]?.[0]).toEqual({
      athleteId: null,
      title: "plan.defaultTitle",
      description: null,
      startDate: mondayOfIsoWeek(todayIsoDate()),
      weeks: Array.from({ length: DEFAULT_WEEK_COUNT }, () => ({ type: "TRAINING" })),
    });
  });

  /**
   * Créer sans ouvrir laisserait le coach sur une liste où une ligne de plus est apparue, sans
   * rien à en faire. C'est la navigation qui fait de la création un geste, et non un effet de
   * bord.
   */
  it("ouvre le constructeur du cycle créé", async () => {
    const { getAllByText, router, user } = await mount();
    await user.click(getAllByText("plan.new")[0] as HTMLElement);

    await mutate.mock.calls[0]?.[1]?.onSuccess({ id: "pln_9" });

    expect(router.state.location.pathname).toBe("/plans/pln_9");
  });

  // L'état vide offre le MÊME geste que l'en-tête : c'est le seul endroit d'où l'on part quand on
  // n'a encore rien.
  it("offre le même geste depuis l'état vide", async () => {
    const { getAllByText, user } = await mount();

    await user.click(getAllByText("plan.new")[1] as HTMLElement);

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  // Une liste garnie n'a plus d'état vide : le geste ne reste que dans l'en-tête.
  it("ne propose plus l'état vide dès qu'un cycle existe", async () => {
    const { getAllByText } = await mount([existingPlan]);

    expect(getAllByText("plan.new")).toHaveLength(1);
  });

  // Un second clic pendant que le premier écrit créerait deux brouillons pour un seul geste.
  it("ferme le bouton pendant la création", async () => {
    vi.mocked(useCreatePlan).mockReturnValue({ mutate, isPending: true } as unknown as ReturnType<
      typeof useCreatePlan
    >);
    const { getAllByText } = await mount();

    expect((getAllByText("plan.creating")[0] as HTMLButtonElement).disabled).toBe(true);
  });
});

/**
 * Une liste qui n'a pas pu être lue n'est PAS une liste vide : proposer « créez votre premier
 * cycle » à un coach qui en a douze est le pire des messages. L'écran dit la panne, et offre le
 * recours.
 */
describe("PlansScreen — la liste ne se charge pas", () => {
  const mountFailed = () => {
    const refetch = vi.fn();
    vi.mocked(usePlans).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof usePlans>);

    return { refetch, rendered: renderInRoute(<PlansScreen />, { path: "/plans" }) };
  };

  it("dit la panne au lieu de faire passer la liste pour vide", async () => {
    const { rendered } = mountFailed();
    const { getByText, queryByText } = await rendered;

    expect(getByText("common.errorTitle")).toBeTruthy();
    expect(queryByText("plan.empty.title")).toBeNull();
  });

  it("relit la liste quand on réessaie", async () => {
    const { refetch, rendered } = mountFailed();
    const { getByText, user } = await rendered;

    await user.click(getByText("common.retry"));

    expect(refetch).toHaveBeenCalled();
  });
});
