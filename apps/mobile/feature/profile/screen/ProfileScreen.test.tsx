import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileScreen } from "@/feature/profile/screen/ProfileScreen";
import { renderRn } from "../../../test/render";

vi.mock("@/feature/account/hook/useCapabilityUpdate", () => ({
  useCapabilityUpdate: () => ({ mutate: vi.fn(), isPending: false }),
  capabilityErrorKey: () => "account.capabilities.error",
}));

vi.mock("@/feature/notification", () => ({
  NotificationEmailSection: () => null,
  revokeCurrentPushToken: vi.fn(async () => undefined),
}));

vi.mock("expo-router", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "u-1", name: "Léa", email: "lea@cmv.test", isAthlete: true } },
      refetch: vi.fn(),
    }),
    signOut: vi.fn(async () => undefined),
  },
}));

const { appVersionLabel } = await import("@/shared/lib/app-version");
/**
 * `currentAppVersion` fait partie du double bien qu'aucun test ne l'appelle : `query.tsx` le lit
 * pour le `buster` du cache persisté (dette M-6), et le harnais de rendu le traverse.
 */
vi.mock("@/shared/lib/app-version", () => ({
  appVersionLabel: vi.fn(),
  currentAppVersion: vi.fn(() => "1.2.0"),
}));
const versionLabel = vi.mocked(appVersionLabel);

describe("ProfileScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    versionLabel.mockReturnValue("1.2.0 (dev)");
  });

  /**
   * L'assertion porte sur la CLÉ : le harnais rend la clé et perd l'interpolation, comme côté web.
   * Ce qui s'éprouve est donc la décision de l'écran, pas la mise en forme du numéro — celle-là est
   * couverte à 100 % par `app-version.util.test.ts`.
   */
  it("montre la version en pied d'écran", () => {
    renderRn(<ProfileScreen />);

    expect(screen.getByText("account.about.version")).toBeTruthy();
    expect(screen.queryByText("account.about.unknown")).toBeNull();
  });

  /**
   * Le cas d'un build sans injection. On dit l'absence plutôt que d'afficher un numéro de repli,
   * qu'un retour de bêta citerait ensuite de bonne foi (règle dure n°5).
   */
  it("dit l'absence plutôt que d'inventer un numéro", () => {
    versionLabel.mockReturnValue(null);

    renderRn(<ProfileScreen />);

    expect(screen.getByText("account.about.unknown")).toBeTruthy();
    expect(screen.queryByText("account.about.version")).toBeNull();
  });

  it("montre le nom et l'adresse du compte", () => {
    renderRn(<ProfileScreen />);

    expect(screen.getByText("Léa")).toBeTruthy();
    expect(screen.getByText("lea@cmv.test")).toBeTruthy();
  });

  /**
   * L'avertissement de retrait ne s'affiche QUE sur un retrait effectif : ce compte n'a pas la
   * casquette coach, il n'a donc rien à perdre de vue.
   */
  it("n'avertit de rien tant qu'aucune casquette n'est retirée", () => {
    renderRn(<ProfileScreen />);

    expect(screen.queryByText("account.capabilities.warnCoach")).toBeNull();
  });
});
