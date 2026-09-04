import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanForm } from "@/feature/plan/component/PlanForm";
import { useCreatePlan } from "@/feature/plan/hook/usePlans";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/plan/hook/usePlans", () => ({ useCreatePlan: vi.fn() }));
vi.mock("@/feature/athlete/hook/useAthletes", () => ({
  useAthletes: () => ({
    data: [{ athleteId: "ath_lea", athleteName: "Léa Moreau", isSelf: false }],
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach_1" } } }) },
}));

const mutate = vi.fn();
vi.mocked(useCreatePlan).mockReturnValue({
  mutate,
  isPending: false,
} as unknown as ReturnType<typeof useCreatePlan>);

// 2026-10-19 est un lundi : un cycle démarre un lundi (planStartDateSchema).
const MONDAY = "2026-10-19";
// Le mercredi de la même semaine — ce qu'un coach choisit sans y penser.
const WEDNESDAY = "2026-10-21";

beforeEach(() => {
  vi.clearAllMocks();
});

const mount = () =>
  renderInRoute(<PlanForm open onClose={vi.fn()} />, {
    path: "/plans",
    links: ["/plans/$planId"],
  });

async function fillMinimum(user: Awaited<ReturnType<typeof mount>>["user"], form: HTMLElement) {
  await user.type(form.querySelector("#planTitle") as HTMLInputElement, "Cycle bloc");
  const start = form.querySelector("#startDate") as HTMLInputElement;
  await user.clear(start);
  await user.type(start, MONDAY);
}

/**
 * Un cycle se construit avant de savoir pour qui (#144) : le sélecteur d'athlète ne commande plus
 * l'envoi, et le choix neutre part en `null`.
 */
describe("PlanForm — l'athlète facultatif", () => {
  it("laisse créer un cycle sans avoir choisi de destinataire", async () => {
    const { getByText, container, user } = await mount();
    await fillMinimum(user, container);

    expect((getByText("plan.form.submit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("transmet null, et non une chaîne vide, quand aucun athlète n'est choisi", async () => {
    const { getByText, container, user } = await mount();
    await fillMinimum(user, container);

    await user.click(getByText("plan.form.submit"));

    expect(mutate.mock.calls[0]?.[0]).toMatchObject({ athleteId: null, title: "Cycle bloc" });
  });

  it("transmet l'athlète choisi quand il y en a un", async () => {
    const { getByText, getByRole, container, user } = await mount();
    await fillMinimum(user, container);
    await user.selectOptions(getByRole("combobox"), "ath_lea");

    await user.click(getByText("plan.form.submit"));

    expect(mutate.mock.calls[0]?.[0]).toMatchObject({ athleteId: "ath_lea" });
  });

  /**
   * Un cycle démarre un lundi (contrainte du schéma partagé). Plutôt que de refuser la saisie, le
   * champ est RÉÉCRIT au lundi de la semaine choisie dès qu'on le quitte — une valeur qui change
   * toute seule sans explication étant plus déroutante qu'un refus, un toast le dit.
   */
  it("recale la date de début sur le lundi de la semaine choisie", async () => {
    const { container, user } = await mount();
    const start = container.querySelector("#startDate") as HTMLInputElement;

    await user.clear(start);
    await user.type(start, WEDNESDAY);
    await user.tab();

    expect(start.value).toBe(MONDAY);
  });

  // Le titre et la date, eux, restent exigés : ce sont les deux seules choses qu'un cycle ne peut
  // pas découvrir plus tard.
  it("garde le titre obligatoire", async () => {
    const { getByText } = await mount();

    expect((getByText("plan.form.submit") as HTMLButtonElement).disabled).toBe(true);
  });
});
