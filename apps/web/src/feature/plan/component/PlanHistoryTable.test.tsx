import { PlanStatus, type PlanSummaryDto, sortAthletePlans } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { PlanHistoryTable } from "@/feature/plan/component/PlanHistoryTable";
import { renderInRoute } from "../../../../test/render";

const TODAY = "2026-09-09";

vi.mock("@cmv/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cmv/shared")>();
  // L'état d'un cycle se lit à une date FIXE : sans quoi la suite changerait de résultat chaque jour.
  return { ...actual, todayIsoDate: () => TODAY };
});

function plan(over: Partial<PlanSummaryDto> & Pick<PlanSummaryDto, "id">): PlanSummaryDto {
  return {
    coachId: "usr_coach",
    athleteId: "ath_lea",
    athleteName: "Léa Bonnet",
    athleteEmail: "lea@example.test",
    title: "Cycle",
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

const ONGOING = plan({ id: "pln_ongoing", title: "Prépa bloc hiver" });
const DRAFT = plan({
  id: "pln_draft",
  title: "Bloc de printemps",
  startDate: "2026-10-12",
  status: PlanStatus.DRAFT,
});
const ENDED = plan({
  id: "pln_ended",
  title: "Reprise estivale",
  startDate: "2026-06-01",
  weekCount: 6,
});
const UPCOMING = plan({ id: "pln_upcoming", title: "Bloc automne", startDate: "2026-09-21" });

function mount(plans: readonly PlanSummaryDto[]) {
  return renderInRoute(<PlanHistoryTable plans={sortAthletePlans(plans)} />, {
    path: "/plans",
    links: ["/plans/$planId"],
  });
}

/**
 * L'historique d'un athlète, déplié sous sa ligne. Ce qu'il doit dire : l'état de chaque cycle —
 * brouillon compris, qui n'existe nulle part ailleurs à l'écran.
 */
describe("PlanHistoryTable", () => {
  it("nomme l'état de chaque cycle, brouillon affecté compris", async () => {
    const { getByText } = await mount([ONGOING, DRAFT, ENDED, UPCOMING]);

    expect(getByText("plan.state.DRAFT")).toBeTruthy();
    expect(getByText("plan.state.ONGOING")).toBeTruthy();
    expect(getByText("plan.state.ENDED")).toBeTruthy();
    expect(getByText("plan.state.UPCOMING")).toBeTruthy();
  });

  it("n'invente aucun état sur un cycle non situable", async () => {
    const { queryByText } = await mount([plan({ id: "pln_broken", weekCount: 0 })]);

    for (const state of ["DRAFT", "ONGOING", "UPCOMING", "ENDED"]) {
      expect(queryByText(`plan.state.${state}`)).toBeNull();
    }
  });

  it("ouvre le constructeur, et non un panneau : un cycle a déjà son écran", async () => {
    const { getByText, user, router } = await mount([ONGOING]);

    await user.click(getByText("Prépa bloc hiver"));

    expect(router.state.location.pathname).toBe("/plans/pln_ongoing");
  });

  it("ne pagine pas cinq cycles — une pagination qui ne pagine rien est du bruit", async () => {
    const five = Array.from({ length: 5 }, (_, index) =>
      plan({ id: `pln_${index}`, title: `Cycle ${index}` }),
    );
    const { queryByText } = await mount(five);

    expect(queryByText("plan.history.range")).toBeNull();
  });

  it("découpe au-delà de cinq, et la seconde page montre le reste", async () => {
    const seven = Array.from({ length: 7 }, (_, index) =>
      // Des débuts décroissants : l'historique va du plus récent au plus ancien.
      plan({
        id: `pln_${index}`,
        title: `Cycle ${index}`,
        startDate: `2026-0${index + 1}-06`,
      }),
    );
    const { getByText, queryByText, user } = await mount(seven);

    expect(getByText("plan.history.range")).toBeTruthy();
    expect(queryByText("Cycle 0")).toBeNull();

    await user.click(getByText("2"));

    expect(getByText("Cycle 0")).toBeTruthy();
  });
});
