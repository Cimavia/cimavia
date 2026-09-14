import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountScreen } from "@/feature/account/screen/AccountScreen";
import { renderInRoute } from "../../../../test/render";

const updateMutate = vi.fn();

vi.mock("@/feature/account/hook/useCapabilityUpdate", () => ({
  useCapabilityUpdate: () => ({ mutate: updateMutate, isPending: false }),
}));

/**
 * `CmvAppShell` tire `NotificationBell` et `useUnreadByCapability` du même module : le remplacer en
 * entier évite qu'un compteur non lu parte chercher l'API pendant qu'on éprouve un pied de page.
 */
vi.mock("@/feature/notification", () => ({
  NotificationEmailSection: () => <div data-testid="notification-section" />,
  NotificationBell: () => <div data-testid="notification-bell" />,
  useUnreadByCapability: () => ({ data: undefined }),
}));

vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "u-1", name: "Léa", isAthlete: true } } }),
  },
}));

const { appVersionLabel } = await import("@/shared/lib/app-version");
vi.mock("@/shared/lib/app-version", () => ({ appVersionLabel: vi.fn() }));
const versionLabel = vi.mocked(appVersionLabel);

describe("AccountScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    versionLabel.mockReturnValue("1.2.0 (dev)");
  });

  /**
   * L'assertion porte sur la CLÉ et non sur « cimavia · v1.2.0 (dev) » : le harnais tourne en
   * `cimode`, où l'interpolation est perdue (cf. `test/i18n.ts`). Ce qui s'éprouve ici est donc la
   * décision de l'écran — laquelle des deux clés il choisit —, la mise en forme du numéro étant
   * couverte à 100 % par `app-version.util.test.ts`.
   */
  it("montre la version en pied d'écran", async () => {
    await renderInRoute(<AccountScreen />, { path: "/account", links: ["/login"] });

    expect(screen.getByText("account.about.version")).toBeInTheDocument();
    expect(screen.queryByText("account.about.unknown")).not.toBeInTheDocument();
  });

  /**
   * Le cas d'un build sans injection. On affiche `—` plutôt qu'un numéro de repli : un « 0.0.0 »
   * serait cité de bonne foi dans un retour de bêta (règle dure n°5).
   */
  it("dit l'absence plutôt que d'inventer un numéro", async () => {
    versionLabel.mockReturnValue(null);

    await renderInRoute(<AccountScreen />, { path: "/account", links: ["/login"] });

    expect(screen.getByText("account.about.unknown")).toBeInTheDocument();
    expect(screen.queryByText("account.about.version")).not.toBeInTheDocument();
  });

  /**
   * L'écran sert d'abord à AJOUTER une casquette. Le bouton reste fermé tant que rien ne change —
   * sinon on enverrait une mutation qui ne demande rien.
   */
  it("garde l'enregistrement fermé tant que les casquettes ne bougent pas", async () => {
    await renderInRoute(<AccountScreen />, { path: "/account", links: ["/login"] });

    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
  });

  it("ouvre l'enregistrement dès qu'une casquette est ajoutée", async () => {
    const { user } = await renderInRoute(<AccountScreen />, {
      path: "/account",
      links: ["/login"],
    });

    await user.click(screen.getByText("account.capabilities.option.coach"));

    expect(screen.getByRole("button", { name: "common.save" })).toBeEnabled();
  });
});
