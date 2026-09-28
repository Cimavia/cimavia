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

const props = {
  athleteId: null,
  isPublished: false,
  hasInvoiceDocument: false,
  isBusy: false,
  onChange: vi.fn(),
};

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
    const { getByRole, queryByTitle, queryByText } = renderWithProviders(
      <PlanAthletePicker {...props} isBusy />,
    );

    expect((getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(queryByTitle("plan.header.athleteLockedPublished")).toBeNull();
    expect(queryByText("plan.header.athleteLockedDocument")).toBeNull();
  });

  /**
   * Le justificatif est rédigé pour CE destinataire, et l'API refuse de le faire suivre (#472).
   * La raison s'écrit sous le champ : c'est un geste à faire ailleurs — retirer le PDF — et une
   * info-bulle sur un contrôle désactivé ne s'affiche pas partout.
   */
  it("se ferme tant qu'un justificatif est joint, et dit quoi faire", () => {
    const { getByRole, getByText } = renderWithProviders(
      <PlanAthletePicker {...props} athleteId="ath_lea" hasInvoiceDocument />,
    );

    expect((getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(getByText("plan.header.athleteLockedDocument")).toBeTruthy();
  });

  // Diffusé, le formulaire dit déjà pourquoi tout est figé : la consigne du PDF serait fausse.
  it("ne parle pas du justificatif sur un cycle diffusé", () => {
    const { queryByText } = renderWithProviders(
      <PlanAthletePicker {...props} athleteId="ath_lea" isPublished hasInvoiceDocument />,
    );

    expect(queryByText("plan.header.athleteLockedDocument")).toBeNull();
  });
});
