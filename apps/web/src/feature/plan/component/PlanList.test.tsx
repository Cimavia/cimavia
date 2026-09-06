import { PlanStatus, type PlanSummaryDto } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { PlanList } from "@/feature/plan/component/PlanList";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach_1" } } }) },
}));

const plan = (over: Partial<PlanSummaryDto>): PlanSummaryDto =>
  ({
    id: "pln_1",
    coachId: "coach_1",
    athleteId: "ath_lea",
    athleteName: "Léa Moreau",
    athleteEmail: "lea@example.test",
    title: "Cycle bloc",
    description: null,
    startDate: "2026-10-19",
    status: PlanStatus.DRAFT,
    publishedAt: null,
    weekCount: 4,
    sessionCount: 8,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...over,
  }) as PlanSummaryDto;

const mount = (plans: PlanSummaryDto[]) =>
  renderInRoute(<PlanList plans={plans} />, {
    path: "/plans",
    links: ["/plans/$planId"],
  });

/**
 * Trois états du destinataire, et pas deux. « À définir » est un choix que le coach n'a pas encore
 * fait — actionnable ; « — » est un nom qu'on n'a pas su résoudre. Les rendre pareil masquerait le
 * seul des deux sur lequel il y a quelque chose à faire (#144).
 */
describe("PlanList — le destinataire", () => {
  it("nomme l'athlète du cycle", async () => {
    const { getByText } = await mount([plan({})]);

    expect(getByText("Léa Moreau")).toBeTruthy();
  });

  it("annonce un brouillon non affecté comme un choix à faire, pas comme une donnée manquante", async () => {
    const { getByText, queryByText } = await mount([
      plan({ athleteId: null, athleteName: null, athleteEmail: null }),
    ]);

    expect(getByText("plan.unassigned")).toBeTruthy();
    expect(queryByText("—")).toBeNull();
  });

  // La carte entière est cliquable : c'est le seul chemin vers le builder depuis cette liste.
  it("ouvre le builder du cycle cliqué", async () => {
    const { getByText, router, user } = await mount([plan({})]);

    await user.click(getByText("Cycle bloc"));

    expect(router.state.location.pathname).toBe("/plans/pln_1");
  });

  /**
   * Le nom vient du DTO, et le DTO le tient de `Plan.athlete` — la clé étrangère vers `User`, pas
   * de la relation coach↔athlète. Un athlète dont la relation a été retirée reste donc NOMMÉ ici.
   * La liste le rendait « — » tant qu'elle résolvait par `GET /athletes` : elle cachait un nom
   * qu'elle avait déjà.
   */
  it("nomme un athlète absent de la liste des relations", async () => {
    const { getByText, queryByText } = await mount([
      plan({ athleteId: "ath_hors_relation", athleteName: "Parti Ailleurs" }),
    ]);

    expect(getByText("Parti Ailleurs")).toBeTruthy();
    expect(queryByText("—")).toBeNull();
  });

  // Le seul cas qui reste pour « — » : le mapper pose les trois champs ensemble, donc il ne devrait
  // pas se produire — mais le type l'autorise, et « null » en clair serait pire.
  it("garde le tiret sur un destinataire posé sans nom", async () => {
    const { getByText, queryByText } = await mount([
      plan({ athleteId: "ath_sans_nom", athleteName: null }),
    ]);

    expect(getByText("—")).toBeTruthy();
    // « À définir » prétendrait qu'il reste un choix à faire : il a été fait.
    expect(queryByText("plan.unassigned")).toBeNull();
  });
});
