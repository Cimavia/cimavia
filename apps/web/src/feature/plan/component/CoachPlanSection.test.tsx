import { PlanStatus, type PlanSummaryDto } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { CoachPlanSection } from "@/feature/plan/component/CoachPlanSection";
import { renderInRoute } from "../../../../test/render";

const TODAY = "2026-09-09";

vi.mock("@cmv/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cmv/shared")>();
  // Les lignes se construisent à une date FIXE : sans quoi la suite changerait chaque jour.
  return { ...actual, todayIsoDate: () => TODAY };
});

function plan(over: Partial<PlanSummaryDto> & Pick<PlanSummaryDto, "id">): PlanSummaryDto {
  return {
    coachId: "usr_coach",
    athleteId: "ath_lea",
    athleteName: "Léa Bonnet",
    athleteEmail: "lea@example.test",
    title: "Prépa bloc hiver",
    description: null,
    startDate: "2026-07-13",
    status: PlanStatus.PUBLISHED,
    publishedAt: "2026-07-01T10:00:00Z",
    weekCount: 10,
    sessionCount: 30,
    createdAt: "2026-07-01T10:00:00Z",
    updatedAt: "2026-07-01T10:00:00Z",
    ...over,
  };
}

const LEA = plan({ id: "pln_lea" });
const YANIS = plan({
  id: "pln_yanis",
  athleteId: "ath_yanis",
  athleteName: "Yanis Belkacem",
  title: "Reprise automne",
  startDate: "2026-06-15",
  weekCount: 6,
});

function mount(plans: readonly PlanSummaryDto[], search: Record<string, string> = {}) {
  return renderInRoute(<CoachPlanSection plans={plans} />, {
    path: "/plans/",
    search,
    links: ["/plans/$planId"],
  });
}

/**
 * La section possède l'état de sa vue — lu dans l'URL. Ce qui s'éprouve ici : qu'une vue filtrée
 * ARRIVE filtrée (lien profond, signet, retour depuis le constructeur), et que le vide de la
 * recherche ne se confonde pas avec l'absence de cycles.
 */
describe("CoachPlanSection", () => {
  it("range d'abord celui qui n'a plus rien : c'est lui qui attend", async () => {
    const { getAllByText } = await mount([LEA, YANIS]);

    const names = getAllByText(/Belkacem|Bonnet/).map((node) => node.textContent);
    expect(names).toEqual(["Yanis Belkacem", "Léa Bonnet"]);
  });

  it("arrive filtré quand l'url le dit — un signet doit se relire", async () => {
    const { getByText, queryByText } = await mount([LEA, YANIS], { state: "ENDED" });

    expect(getByText("Yanis Belkacem")).toBeTruthy();
    expect(queryByText("Léa Bonnet")).toBeNull();
  });

  it("arrive cherché de même, sans casse ni accent", async () => {
    const { getByText, queryByText } = await mount([LEA, YANIS], { q: "lea" });

    expect(getByText("Léa Bonnet")).toBeTruthy();
    expect(queryByText("Yanis Belkacem")).toBeNull();
  });

  it("arrive déplié sur l'athlète de l'url", async () => {
    const { getByText } = await mount([LEA, YANIS], { athlete: "ath_lea" });

    expect(getByText("plan.history.columns.plan")).toBeTruthy();
  });

  it("une recherche sans résultat n'est PAS « aucune planification »", async () => {
    const { getByText, queryByText } = await mount([LEA, YANIS], { q: "personne" });

    expect(getByText("plan.noMatch.title")).toBeTruthy();
    expect(queryByText("plan.table.columns.athlete")).toBeNull();
  });

  it("écrit le filtre dans l'url sans empiler d'historique", async () => {
    const { getByText, user, router } = await mount([LEA, YANIS]);

    await user.click(getByText("plan.stateFilter.ENDED"));

    expect(router.state.location.search).toMatchObject({ state: "ENDED" });
  });

  it("n'écrit pas « Tous » dans l'url : c'est le défaut, l'y laisser serait du bruit", async () => {
    const { getByText, user, router } = await mount([LEA, YANIS], { state: "ENDED" });

    await user.click(getByText("plan.stateFilter.ALL"));

    expect(router.state.location.search).not.toHaveProperty("state");
  });

  it("écrit la recherche dans l'url, frappe par frappe", async () => {
    const { getByLabelText, user, router } = await mount([LEA, YANIS]);

    await user.type(getByLabelText("plan.searchLabel"), "bel");

    expect(router.state.location.search).toMatchObject({ q: "bel" });
  });

  it("efface la recherche de l'url plutôt que d'y laisser une chaîne vide", async () => {
    const { getByLabelText, user, router } = await mount([LEA, YANIS], { q: "b" });

    await user.clear(getByLabelText("plan.searchLabel"));

    expect(router.state.location.search).not.toHaveProperty("q");
  });

  it("recliquer l'athlète déplié le referme", async () => {
    const { getByText, user, router } = await mount([LEA, YANIS], { athlete: "ath_lea" });

    await user.click(getByText("Léa Bonnet"));

    expect(router.state.location.search).not.toHaveProperty("athlete");
  });
});
