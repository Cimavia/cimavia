import { ApiError, CapabilityBlocker } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capabilityApi } from "@/feature/account/api";
import { AccountScreen } from "@/feature/account/screen/AccountScreen";
import { renderInRoute } from "../../../../test/render";

/**
 * Le VRAI `useCapabilityUpdate`, seul `api.ts` est bouchonné (« Tranché en #507 ») : ce qui
 * s'éprouve ici est ce qui part vers l'API, puis le rechargement ou le refus traduit.
 */
vi.mock("@/feature/account/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/account/api")>();
  return { ...actual, capabilityApi: { ...actual.capabilityApi, update: vi.fn() } };
});

/**
 * `CmvAppShell` tire `NotificationBell` et `useUnreadByCapability` du même module : le remplacer en
 * entier évite qu'un compteur non lu parte chercher l'API pendant qu'on éprouve un pied de page.
 */
vi.mock("@/feature/notification", () => ({
  NotificationEmailSection: () => <div data-testid="notification-section" />,
  NotificationBell: () => <div data-testid="notification-bell" />,
  useUnreadByCapability: () => ({ data: undefined }),
}));

const session = vi.hoisted(() => ({
  user: { id: "u-1", name: "Léa", isCoach: false, isAthlete: true },
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: { user: session.user } }) },
}));

const { appVersionLabel } = await import("@/shared/lib/app-version");
vi.mock("@/shared/lib/app-version", () => ({ appVersionLabel: vi.fn() }));
const versionLabel = vi.mocked(appVersionLabel);

const SAVE = "common.save";
const COACH = "account.capabilities.option.coach";
const ATHLETE = "account.capabilities.option.athlete";

const original = window.location;
const assign = vi.fn();

function open() {
  return renderInRoute(<AccountScreen />, { path: "/account", links: ["/login"] });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: "u-1", name: "Léa", isCoach: false, isAthlete: true };
  versionLabel.mockReturnValue("1.2.0 (dev)");
  vi.mocked(capabilityApi.update).mockResolvedValue(undefined as never);
  // jsdom ne navigue pas : le rechargement se constate sur `assign`, sans quitter le test.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: original });
});

describe("AccountScreen — le pied", () => {
  /**
   * L'assertion porte sur la CLÉ et non sur « cimavia · v1.2.0 (dev) » : le harnais tourne en
   * `cimode`, où l'interpolation est perdue (cf. `test/i18n.ts`). Ce qui s'éprouve ici est donc la
   * décision de l'écran — laquelle des deux clés il choisit —, la mise en forme du numéro étant
   * couverte à 100 % par `app-version.util.test.ts`.
   */
  it("montre la version en pied d'écran", async () => {
    await open();

    expect(screen.getByText("account.about.version")).toBeInTheDocument();
    expect(screen.queryByText("account.about.unknown")).not.toBeInTheDocument();
  });

  /**
   * Le cas d'un build sans injection. On affiche `—` plutôt qu'un numéro de repli : un « 0.0.0 »
   * serait cité de bonne foi dans un retour de bêta (règle dure n°5).
   */
  it("dit l'absence plutôt que d'inventer un numéro", async () => {
    versionLabel.mockReturnValue(null);

    await open();

    expect(screen.getByText("account.about.unknown")).toBeInTheDocument();
    expect(screen.queryByText("account.about.version")).not.toBeInTheDocument();
  });
});

describe("AccountScreen — les casquettes", () => {
  /**
   * L'écran sert d'abord à AJOUTER une casquette. Le bouton reste fermé tant que rien ne change —
   * sinon on enverrait une mutation qui ne demande rien.
   */
  it("garde l'enregistrement fermé tant que les casquettes ne bougent pas", async () => {
    await open();

    expect(screen.getByRole("button", { name: SAVE })).toBeDisabled();
  });

  it("ouvre l'enregistrement dès qu'une casquette est ajoutée", async () => {
    const { user } = await open();

    await user.click(screen.getByText(COACH));

    expect(screen.getByRole("button", { name: SAVE })).toBeEnabled();
  });

  // Revenir à l'état de départ, c'est n'avoir rien changé : le bouton se referme.
  it("referme l'enregistrement quand on revient sur son choix", async () => {
    const { user } = await open();

    await user.click(screen.getByText(COACH));
    await user.click(screen.getByText(COACH));

    expect(screen.getByRole("button", { name: SAVE })).toBeDisabled();
  });

  // Un compte sans casquette n'a plus d'espace où aller : on le dit, et on n'envoie rien.
  it("refuse de tout retirer, et dit pourquoi", async () => {
    const { user } = await open();

    await user.click(screen.getByText(ATHLETE));

    expect(screen.getByText("account.capabilities.atLeastOne")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SAVE })).toBeDisabled();
  });

  // L'avertissement n'accompagne QUE le retrait du coach : c'est ce qu'on s'apprête à perdre de vue.
  it("avertit au retrait de la casquette coach, et seulement là", async () => {
    session.user = { ...session.user, isCoach: true };
    const { user } = await open();
    expect(screen.queryByText("account.capabilities.warnCoach")).toBeNull();

    await user.click(screen.getByText(COACH));

    expect(screen.getByText("account.capabilities.warnCoach")).toBeInTheDocument();
  });
});

describe("AccountScreen — l'enregistrement", () => {
  /**
   * Changer de casquette change la session, donc la navigation entière : l'écran recharge à la
   * racine, seule route ouverte quelle que soit la capacité restante.
   */
  it("envoie les deux casquettes, puis recharge à la racine", async () => {
    const { user } = await open();

    await user.click(screen.getByText(COACH));
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(capabilityApi.update).toHaveBeenCalledWith({ isCoach: true, isAthlete: true });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  it("dit l'enregistrement en cours, bouton éteint", async () => {
    vi.mocked(capabilityApi.update).mockReturnValue(new Promise(() => {}));
    const { user } = await open();

    await user.click(screen.getByText(COACH));
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(await screen.findByRole("button", { name: "common.saving" })).toBeDisabled();
  });

  /**
   * L'API refuse par un CODE, que l'écran traduit. Un code inconnu (API plus récente que ce
   * client) ou une panne sans code retombent sur l'erreur générique, jamais sur l'identifiant brut.
   */
  it.each([
    [
      "un coach qui a encore des athlètes",
      new ApiError(409, CapabilityBlocker.ACTIVE_ATHLETES, null),
      "account.capabilities.blocked.ACTIVE_ATHLETES",
    ],
    [
      "un athlète encore lié à son coach",
      new ApiError(409, CapabilityBlocker.ACTIVE_COACH, null),
      "account.capabilities.blocked.ACTIVE_COACH",
    ],
    ["un code inconnu", new ApiError(409, "NOUVEAU_CODE", null), "common.error"],
    ["une panne sans code", new Error("réseau"), "common.error"],
  ])("traduit le refus pour %s, sans recharger", async (_who, failure, text) => {
    vi.mocked(capabilityApi.update).mockRejectedValue(failure);
    session.user = { ...session.user, isCoach: true };
    const { user } = await open();

    await user.click(screen.getByText(COACH));
    await user.click(screen.getByRole("button", { name: SAVE }));

    expect(await screen.findByRole("status")).toHaveTextContent(text);
    expect(assign).not.toHaveBeenCalled();
  });
});
