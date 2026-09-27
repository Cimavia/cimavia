import { Text } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { type SessionCapabilities, useCapabilities } from "@/shared/hook/useCapabilities";
import { renderRn } from "../../test/render";
import { CmvCapabilityGate } from "./CmvCapabilityGate";

vi.mock("@/shared/hook/useCapabilities", () => ({ useCapabilities: vi.fn() }));

const SCREEN = "écran gardé";

const SIGNED_OUT: SessionCapabilities = {
  isCoach: false,
  isAthlete: false,
  isPending: false,
  isAuthenticated: false,
};

function setup(session: Partial<SessionCapabilities>) {
  vi.mocked(useCapabilities).mockReturnValue({ ...SIGNED_OUT, ...session });
  return renderRn(
    <CmvCapabilityGate capability="athlete">
      <Text>{SCREEN}</Text>
    </CmvCapabilityGate>,
  );
}

const redirectOf = (container: HTMLElement) =>
  container.querySelector("[data-redirect]")?.getAttribute("data-redirect") ?? null;

/**
 * La garde des routes hors onglets (#20) — la fiche athlète, la séance, les débriefs, les rappels,
 * « Rejoindre ». Ce qu'une régression y ferait sans qu'aucune autre porte ne rougisse (#338) :
 * ouvrir l'écran d'un rôle à l'autre, qui y prendrait un 403 à chaque requête.
 */
describe("CmvCapabilityGate", () => {
  it("n'accorde ni ne refuse tant que la session n'est pas résolue", () => {
    const { container, getByRole, queryByText } = setup({ isPending: true });

    // Refuser ici renverrait ailleurs à chaque démarrage à froid ; accorder monterait l'écran — et
    // partir ses requêtes — le temps d'un aller-retour.
    expect(getByRole("progressbar")).toBeTruthy();
    expect(queryByText(SCREEN)).toBeNull();
    expect(redirectOf(container)).toBeNull();
  });

  it("monte l'écran quand la capacité est là", () => {
    const { container, getByText } = setup({ isAthlete: true, isAuthenticated: true });

    expect(getByText(SCREEN)).toBeTruthy();
    expect(redirectOf(container)).toBeNull();
  });

  it("renvoie l'autre rôle sur son propre premier onglet, sans monter l'écran", () => {
    const { container, queryByText } = setup({ isCoach: true, isAuthenticated: true });

    // Son premier onglet et non un écran fixe : le tableau de bord pour un coach (`landingTab`).
    expect(redirectOf(container)).toBe("/dashboard");
    expect(queryByText(SCREEN)).toBeNull();
  });

  it("ne monte pas l'écran sans session", () => {
    const { container, queryByText } = setup({});

    expect(queryByText(SCREEN)).toBeNull();
    // Renvoyé, mais pas vers la connexion : `landingTab` trouve toujours un onglet commun
    // (`tabs.test.ts`), si bien que le repli `/login` de la garde est inatteignable. Ce qu'un
    // déconnecté devrait voir relève de la session perdue sur mobile (#439), pas de cette garde.
    expect(redirectOf(container)).not.toBeNull();
  });
});
