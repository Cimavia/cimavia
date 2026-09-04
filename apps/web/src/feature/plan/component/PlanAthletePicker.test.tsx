import { describe, expect, it, vi } from "vitest";
import { PlanAthletePicker } from "@/feature/plan/component/PlanAthletePicker";
import { renderWithProviders } from "../../../../test/render";

/**
 * La liste d'athlètes a son propre transport ; ce qui s'éprouve ici est ce que le sélecteur
 * DÉCIDE — ce qu'il transmet, et quand il se ferme.
 */
vi.mock("@/feature/athlete/hook/useAthletes", () => ({
  useAthletes: () => ({
    data: [
      { athleteId: "ath_lea", athleteName: "Léa Moreau", isSelf: false },
      { athleteId: "ath_noah", athleteName: "Noah Fontaine", isSelf: false },
    ],
  }),
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "coach_1" } } }) },
}));

const props = { athleteId: null, isPublished: false, isBusy: false, onChange: vi.fn() };

describe("PlanAthletePicker", () => {
  it("montre le cycle comme non affecté quand il n'a pas de destinataire", () => {
    const { getByRole } = renderWithProviders(<PlanAthletePicker {...props} />);

    expect((getByRole("combobox") as HTMLSelectElement).value).toBe("");
  });

  it("transmet l'athlète choisi", async () => {
    const onChange = vi.fn();
    const { getByRole, user } = renderWithProviders(
      <PlanAthletePicker {...props} onChange={onChange} />,
    );

    await user.selectOptions(getByRole("combobox"), "ath_noah");

    expect(onChange).toHaveBeenCalledWith("ath_noah");
  });

  /**
   * Le choix neutre vaut « pas encore décidé », et part en `null` — jamais en chaîne vide, que
   * l'API prendrait pour un identifiant d'athlète et refuserait en 400.
   */
  it("transmet null, et non une chaîne vide, quand on détache le cycle", async () => {
    const onChange = vi.fn();
    const { getByRole, user } = renderWithProviders(
      <PlanAthletePicker {...props} athleteId="ath_lea" onChange={onChange} />,
    );

    await user.selectOptions(getByRole("combobox"), "");

    expect(onChange).toHaveBeenCalledWith(null);
  });

  /**
   * Désactivé et EXPLIQUÉ, jamais masqué : le faire disparaître laisserait croire que le
   * destinataire n'a jamais été modifiable, alors qu'il l'était jusqu'à la diffusion.
   */
  it("se ferme sur un cycle diffusé, sans disparaître, en disant pourquoi", () => {
    const { getByRole, getByTitle } = renderWithProviders(
      <PlanAthletePicker {...props} athleteId="ath_lea" isPublished />,
    );

    expect((getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(getByTitle("plan.header.athleteLockedPublished")).toBeTruthy();
  });

  it("se ferme pendant une écriture en cours, sans rien expliquer", () => {
    const { getByRole, queryByTitle } = renderWithProviders(
      <PlanAthletePicker {...props} isBusy />,
    );

    expect((getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(queryByTitle("plan.header.athleteLockedPublished")).toBeNull();
  });
});
