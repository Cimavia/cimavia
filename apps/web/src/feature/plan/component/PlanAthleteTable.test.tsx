import { buildPlanAthleteRows, PlanStatus, type PlanSummaryDto } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { PlanAthleteTable } from "@/feature/plan/component/PlanAthleteTable";
import { renderInRoute } from "../../../../test/render";

// Mercredi. Les cycles démarrent un lundi (contrainte de `planStartDateSchema`).
const TODAY = "2026-09-09";

vi.mock("@cmv/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cmv/shared")>();
  // La ligne se construit à une date FIXE : sans quoi la suite changerait de résultat chaque jour.
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

const LEA_ONGOING = plan({ id: "pln_lea", title: "Prépa bloc hiver" });
const LEA_DRAFT = plan({
  id: "pln_draft",
  title: "Bloc de printemps",
  startDate: "2026-10-12",
  weekCount: 6,
  status: PlanStatus.DRAFT,
});

// Deux cycles diffusés qui courent ensemble : depuis #172 l'athlète suit les deux (#225 signalait
// l'inverse, du temps où l'API n'en servait qu'un).
const ADRIEN = { athleteId: "ath_adrien", athleteName: "Adrien Roux" };
const VOLUME = plan({
  ...ADRIEN,
  id: "pln_volume",
  title: "Volume estival",
  startDate: "2026-08-10",
});
const TRAIL = plan({
  ...ADRIEN,
  id: "pln_trail",
  title: "Prépa trail court",
  startDate: "2026-08-24",
  weekCount: 6,
});

function rowsOf(plans: readonly PlanSummaryDto[]) {
  return buildPlanAthleteRows(plans, TODAY) ?? [];
}

function mount(plans: readonly PlanSummaryDto[], expandedAthleteId: string | null = null) {
  const onToggle = vi.fn();
  return renderInRoute(
    <PlanAthleteTable
      rows={rowsOf(plans)}
      expandedAthleteId={expandedAthleteId}
      onToggle={onToggle}
    />,
    { path: "/plans", links: ["/plans/$planId"] },
  ).then((result) => ({ ...result, onToggle }));
}

/**
 * Le tableau des planifications par athlète. Les décomptes et les dates interpolées ne sont pas
 * observables (`cimode` perd l'interpolation, cf. `test/i18n.ts`) : on affirme sur ce qui les
 * gouverne — la pastille choisie, le dépli, le signalement d'anomalie.
 */
describe("PlanAthleteTable", () => {
  it("nomme l'athlète, pas le cycle : c'est lui qu'on cherche des yeux", async () => {
    const { getByText } = await mount([LEA_ONGOING, LEA_DRAFT]);

    expect(getByText("Léa Bonnet")).toBeTruthy();
    expect(getByText("Prépa bloc hiver")).toBeTruthy();
  });

  it("un brouillon ne remplace pas le cycle courant sur la ligne", async () => {
    const { queryByText } = await mount([LEA_ONGOING, LEA_DRAFT]);

    // Il est dans l'historique, pas dans la colonne « Cycle » — l'athlète ne le voit pas.
    expect(queryByText("Bloc de printemps")).toBeNull();
  });

  it("n'ayant que des brouillons, l'athlète n'a ni cycle ni échéance à montrer", async () => {
    const { getAllByText } = await mount([LEA_DRAFT]);

    // Deux « — » : le cycle courant et l'échéance. Jamais « 0 », qui se lirait comme une mesure.
    expect(getAllByText("—")).toHaveLength(2);
  });

  it("déplie l'athlète demandé, et lui seul", async () => {
    const { getByText, queryByText } = await mount([LEA_ONGOING, LEA_DRAFT], "ath_lea");

    // L'historique n'est monté que sous la ligne dépliée.
    expect(getByText("Bloc de printemps")).toBeTruthy();
    expect(queryByText("plan.history.columns.plan")).toBeTruthy();
  });

  it("ne monte aucun historique tant que rien n'est déplié", async () => {
    const { queryByText } = await mount([LEA_ONGOING, LEA_DRAFT]);

    expect(queryByText("plan.history.columns.plan")).toBeNull();
  });

  it("demande le dépli de l'athlète cliqué", async () => {
    const { getByText, user, onToggle } = await mount([LEA_ONGOING]);

    await user.click(getByText("Léa Bonnet"));

    expect(onToggle).toHaveBeenCalledWith("ath_lea");
  });

  it("signale sur la ligne les deux cycles diffusés menés de front", async () => {
    const { getByText } = await mount([VOLUME, TRAIL]);

    expect(getByText("plan.concurrency.flag")).toBeTruthy();
  });

  /**
   * La colonne RÉSUME l'athlète en une ligne et n'en montre donc qu'un — le plus récemment
   * démarré. Ce n'est plus « celui qui est servi » depuis #172, où l'athlète a cessé d'ignorer
   * l'autre : c'est le bandeau du dépli qui nomme les deux.
   */
  it("résume par un seul cycle, le plus récemment commencé", async () => {
    const { getByText, queryByText } = await mount([VOLUME, TRAIL]);

    expect(getByText("Prépa trail court")).toBeTruthy();
    expect(queryByText("Volume estival")).toBeNull();
  });

  it("le bandeau ouvre le dépli, avant l'historique", async () => {
    const { getByText } = await mount([VOLUME, TRAIL], "ath_adrien");

    expect(getByText("plan.concurrency.notice")).toBeTruthy();
  });

  it("ne signale rien quand un seul cycle court", async () => {
    const { queryByText } = await mount([LEA_ONGOING], "ath_lea");

    expect(queryByText("plan.concurrency.flag")).toBeNull();
    expect(queryByText("plan.concurrency.notice")).toBeNull();
  });
});
