import { CapabilityBlocker } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { router } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { capabilityApi } from "@/feature/account/api";
import { revokeCurrentPushToken } from "@/feature/notification";
import { ProfileScreen } from "@/feature/profile/screen/ProfileScreen";
import { resetAccountData } from "@/shared/lib/account-reset";
import { ApiError } from "@/shared/lib/api";
import { authClient } from "@/shared/lib/auth";
import { pressButton, renderRn } from "../../../test/render";

/**
 * Les gestes de la déconnexion écrivent dans UN journal : c'est leur ORDRE que #345 garde, et des
 * doubles séparés ne sauraient dire que l'un est passé avant l'autre.
 */
const { journal } = vi.hoisted(() => ({ journal: [] as string[] }));

// Les appels sont remplacés, le hook de mise à jour et sa traduction des refus restent les VRAIS.
vi.mock("@/feature/account/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/account/api")>();
  return { ...original, capabilityApi: { ...original.capabilityApi, update: vi.fn() } };
});

vi.mock("@/feature/notification", () => ({
  NotificationEmailSection: () => null,
  revokeCurrentPushToken: vi.fn(async () => {
    journal.push("revoke");
  }),
}));

vi.mock("@/shared/lib/account-reset", () => ({
  resetAccountData: vi.fn(async () => {
    journal.push("reset");
  }),
}));

vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: vi.fn(),
    signOut: vi.fn(async () => {
      journal.push("signOut");
    }),
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
const update = vi.mocked(capabilityApi.update);
const refetch = vi.fn();

const SAVE = "common.save";
const OPTION_COACH = "account.capabilities.option.coach";
const OPTION_ATHLETE = "account.capabilities.option.athlete";

function signedIn(user: { isCoach?: boolean; isAthlete?: boolean } | null): void {
  vi.mocked(authClient.useSession).mockReturnValue({
    data:
      user == null ? null : { user: { id: "u-1", name: "Léa", email: "lea@cmv.test", ...user } },
    refetch,
  } as unknown as ReturnType<typeof authClient.useSession>);
}

beforeEach(() => {
  journal.length = 0;
  versionLabel.mockReturnValue("1.2.0 (dev)");
  signedIn({ isAthlete: true });
  update.mockResolvedValue({ isCoach: true, isAthlete: true, isCompany: false });
  vi.mocked(router.replace).mockImplementation(() => {
    journal.push("replace:/login");
  });
});

describe("ProfileScreen", () => {
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

  // « Mes coachs » (#599) : la seule entrée d'un athlète déjà suivi vers un second coach.
  it("mène un athlète à ses coachs", () => {
    renderRn(<ProfileScreen />);

    pressButton(document.body, "account.coaches.title");

    expect(router.push).toHaveBeenCalledWith("/join");
  });

  // La route est gardée par capacité : la proposer à un coach seul le mènerait à un refus.
  it("ne propose pas « Mes coachs » à un coach seul", () => {
    signedIn({ isCoach: true });

    renderRn(<ProfileScreen />);

    expect(screen.queryByText("account.coaches.title")).toBeNull();
  });

  /** Session pas encore là : « — » plutôt qu'un nom vide qui ferait croire à un compte sans nom. */
  it("marque l'absence du nom et de l'adresse tant que la session manque", () => {
    signedIn(null);

    renderRn(<ProfileScreen />);

    expect(screen.getAllByText("—")).toHaveLength(2);
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

describe("ProfileScreen — la déconnexion (#345)", () => {
  /**
   * L'ordre porte toute la sécurité. La route de révocation est scopée à l'utilisateur CONNECTÉ :
   * inversée avec le `signOut`, elle échouerait en 401 — avalé par conception, sans un mot — et le
   * prochain utilisateur du téléphone recevrait les notifications du compte quitté. La purge vient
   * ensuite (ce qu'elle efface est éprouvé par `account-reset.test.ts`), la navigation en dernier.
   */
  it("détache l'appareil, ferme la session, purge l'appareil, puis ramène à la connexion", async () => {
    const { container } = renderRn(<ProfileScreen />);

    pressButton(container, "common.logout");

    await waitFor(() => expect(journal).toHaveLength(4));
    expect(journal).toEqual(["revoke", "signOut", "reset", "replace:/login"]);
    expect(revokeCurrentPushToken).toHaveBeenCalledTimes(1);
    expect(resetAccountData).toHaveBeenCalledTimes(1);
  });
});

describe("ProfileScreen — les casquettes", () => {
  it("ne propose pas d'enregistrer tant que rien n'a changé", () => {
    const { container } = renderRn(<ProfileScreen />);

    pressButton(container, SAVE);

    expect(update).not.toHaveBeenCalled();
  });

  /**
   * La barre d'onglets et l'espace courant dérivent de la session : la redemander suffit à les
   * recalculer, sans navigation ni rechargement.
   */
  it("enregistre la casquette ajoutée, puis redemande la session", async () => {
    const { container } = renderRn(<ProfileScreen />);

    pressButton(container, OPTION_COACH);
    pressButton(container, SAVE);

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith({ isCoach: true, isAthlete: true });
  });

  it("dit « enregistrement » pendant l'envoi", async () => {
    update.mockReturnValue(new Promise(() => undefined));
    const { container } = renderRn(<ProfileScreen />);

    pressButton(container, OPTION_COACH);
    pressButton(container, SAVE);

    expect(await screen.findByText("common.saving")).toBeTruthy();
  });

  it("refuse de tout retirer, sans rien envoyer", () => {
    const { container } = renderRn(<ProfileScreen />);

    pressButton(container, OPTION_ATHLETE);
    pressButton(container, SAVE);

    expect(screen.getByText("account.capabilities.atLeastOne")).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  });

  /** Rappeler ce qu'on garde n'a de sens qu'au moment où l'on s'apprête à le perdre de vue. */
  it("avertit un coach qui retire sa casquette de coach, et plus quand il la remet", () => {
    signedIn({ isCoach: true, isAthlete: true });
    const { container } = renderRn(<ProfileScreen />);

    pressButton(container, OPTION_COACH);
    expect(screen.getByText("account.capabilities.warnCoach")).toBeTruthy();

    pressButton(container, OPTION_COACH);
    expect(screen.queryByText("account.capabilities.warnCoach")).toBeNull();
  });

  /**
   * L'API renvoie un CODE, traduit ici. Un code inconnu (API plus récente que ce binaire) retombe
   * sur l'erreur générique plutôt que d'afficher un identifiant brut.
   */
  it.each([
    [
      CapabilityBlocker.ACTIVE_ATHLETES,
      `account.capabilities.blocked.${CapabilityBlocker.ACTIVE_ATHLETES}`,
    ],
    [
      CapabilityBlocker.ACTIVE_COACH,
      `account.capabilities.blocked.${CapabilityBlocker.ACTIVE_COACH}`,
    ],
    ["UNKNOWN_BLOCKER", "common.error"],
  ])("traduit le refus %s en %s", async (code, message) => {
    signedIn({ isCoach: true, isAthlete: true });
    update.mockRejectedValue(new ApiError(409, code, null));
    const { container } = renderRn(<ProfileScreen />);

    pressButton(container, OPTION_COACH);
    pressButton(container, SAVE);

    expect(await screen.findByText(message)).toBeTruthy();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("retombe sur l'erreur générique quand la panne n'a pas de message à montrer", async () => {
    update.mockRejectedValue(new Error("réseau coupé"));
    const { container } = renderRn(<ProfileScreen />);

    pressButton(container, OPTION_COACH);
    pressButton(container, SAVE);

    expect(await screen.findByText("common.error")).toBeTruthy();
  });

  it("efface le refus dès qu'on retouche une casquette", async () => {
    signedIn({ isCoach: true, isAthlete: true });
    update.mockRejectedValue(new ApiError(409, CapabilityBlocker.ACTIVE_ATHLETES, null));
    const { container } = renderRn(<ProfileScreen />);
    pressButton(container, OPTION_COACH);
    pressButton(container, SAVE);
    const refusal = `account.capabilities.blocked.${CapabilityBlocker.ACTIVE_ATHLETES}`;
    await screen.findByText(refusal);

    pressButton(container, OPTION_COACH);

    expect(screen.queryByText(refusal)).toBeNull();
  });
});
