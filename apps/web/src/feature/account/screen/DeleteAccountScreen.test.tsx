import { ApiError, ProblemType } from "@cmv/shared";
import { onlineManager } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountErasureApi } from "@/feature/account/api";
import { DeleteAccountScreen } from "@/feature/account/screen/DeleteAccountScreen";
import { resetAccountData } from "@/shared/lib/account-reset";
import { holdSessionRecheck, releaseSessionRecheck } from "@/shared/lib/auth";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/account/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/account/api")>();
  return { ...actual, accountErasureApi: { erase: vi.fn() } };
});

vi.mock("@/feature/notification", () => ({
  NotificationBell: () => null,
  useUnreadByCapability: () => ({ data: undefined }),
}));

vi.mock("@/shared/lib/account-reset", () => ({ resetAccountData: vi.fn() }));

const session = vi.hoisted(() => ({
  user: { id: "u-1", name: "Léa", isCoach: false, isAthlete: true } as Record<string, unknown>,
}));
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: session.user && { user: session.user } }), getSession },
  holdSessionRecheck: vi.fn(),
  releaseSessionRecheck: vi.fn(),
}));

const SUBMIT = "account.delete.submit";
const PASSWORD = "common.password";

const original = window.location;
const replace = vi.fn();

function open() {
  return renderInRoute(<DeleteAccountScreen />, {
    path: "/account/delete",
    links: ["/login", "/account"],
  });
}

async function submit(password: string) {
  const view = await open();
  const field = screen.getByLabelText(PASSWORD);
  await view.user.type(field, password);
  await view.user.click(screen.getByRole("button", { name: SUBMIT }));
  return field;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: "u-1", name: "Léa", isCoach: false, isAthlete: true };
  vi.mocked(accountErasureApi.erase).mockResolvedValue(undefined);
  getSession.mockResolvedValue({ data: { user: session.user }, error: null });
  // jsdom ne navigue pas : le départ se constate sur `replace`, sans quitter le test.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, replace },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: original });
});

describe("DeleteAccountScreen — ce qui est annoncé", () => {
  it.each([
    ["un athlète", { isAthlete: true }, ["gone.athlete", "kept.athlete"], ["gone.coach"]],
    ["un coach", { isCoach: true }, ["gone.coach", "kept.coach"], ["gone.athlete"]],
    [
      "un compte aux deux capacités",
      { isCoach: true, isAthlete: true },
      ["gone.coach", "gone.athlete", "kept.coach", "kept.athlete"],
      ["gone.company"],
    ],
    ["une entreprise", { isCompany: true }, ["gone.company"], ["kept.coach", "kept.athlete"]],
  ])("annonce à %s ce qui le concerne", async (_who, capabilities, shown, hidden) => {
    session.user = { id: "u-1", name: "Léa", ...capabilities };

    await open();

    for (const key of shown) {
      expect(screen.getByText(`account.delete.${key}`)).toBeInTheDocument();
    }
    for (const key of hidden) {
      expect(screen.queryByText(`account.delete.${key}`)).toBeNull();
    }
    expect(screen.getByText("account.delete.warning")).toBeInTheDocument();
    expect(screen.getByText("account.delete.backups")).toBeInTheDocument();
  });

  // La garde garde l'écran monté quand la session tombe : les listes ne doivent pas se vider.
  it("garde ses listes quand la session tombe sous l'écran", async () => {
    const view = await open();

    session.user = null as never;
    await view.user.type(screen.getByLabelText(PASSWORD), "s");

    expect(screen.getByText("account.delete.gone.athlete")).toBeInTheDocument();
  });
});

describe("DeleteAccountScreen — le geste", () => {
  it("garde le bouton éteint sans mot de passe", async () => {
    await open();

    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();
  });

  /**
   * L'ordre compte : le cache se vide AVANT de quitter la page, et le départ remplace l'entrée
   * d'historique. Aucun `signOut` n'est bouchonné ici : l'écran n'y touche pas.
   */
  it("envoie le mot de passe, vide le cache, puis part sur la confirmation", async () => {
    await submit("secret");

    expect(accountErasureApi.erase).toHaveBeenCalledWith({ password: "secret" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/deleted"));
    expect(vi.mocked(resetAccountData).mock.invocationCallOrder[0]).toBeLessThan(
      replace.mock.invocationCallOrder[0] as number,
    );
  });

  it("dit la suppression en cours, bouton éteint", async () => {
    vi.mocked(accountErasureApi.erase).mockReturnValue(new Promise(() => {}));

    await submit("secret");

    expect(await screen.findByRole("button", { name: "account.delete.submitting" })).toBeDisabled();
  });

  // Le compte part avant la réponse : un 401 de la page ouvrirait la reconnexion sur un compte disparu.
  it("suspend la relecture de session jusqu'au départ, sans la relâcher après", async () => {
    await submit("secret");

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(holdSessionRecheck).toHaveBeenCalledOnce();
    expect(releaseSessionRecheck).not.toHaveBeenCalled();
  });

  // En attente hors ligne, le geste irréversible partirait tout seul au retour du réseau.
  it("n'attend pas le réseau pour tenter la suppression", async () => {
    onlineManager.setOnline(false);
    try {
      await submit("secret");

      await waitFor(() => expect(accountErasureApi.erase).toHaveBeenCalled());
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("relâche la relecture de session sur un échec", async () => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(new ApiError(409, "Réessaie", null));

    await submit("secret");

    await waitFor(() => expect(releaseSessionRecheck).toHaveBeenCalledOnce());
  });
});

describe("DeleteAccountScreen — les refus", () => {
  const rejected = new ApiError(403, "Refus", null, true, ProblemType.ERASURE_PASSWORD_REJECTED);

  it("vide le champ sur un mot de passe refusé", async () => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(rejected);

    const field = await submit("faux");

    expect(await screen.findByText("account.delete.failure.wrongPassword")).toBeInTheDocument();
    expect(field).toHaveValue("");
    expect(replace).not.toHaveBeenCalled();
  });

  // Le mot de passe est bon, ou n'a pas été jugé : le faire retaper ne servirait à rien.
  it.each([
    ["trop d'essais", new ApiError(429, "Trop", null), "account.delete.failure.tooManyAttempts"],
    ["un compte occupé", new ApiError(409, "Réessaie", null), "account.delete.failure.busy"],
    ["une panne", new TypeError("réseau"), "common.error"],
  ])("garde la saisie sur %s", async (_case, failure, message) => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(failure);

    const field = await submit("secret");

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(field).toHaveValue("secret");
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("DeleteAccountScreen — la réponse perdue", () => {
  const lost = new TypeError("réseau");

  // Le compte part au COMMIT : sans cette relecture, la personne verrait un échec, puis la reconnexion.
  it("part sur la confirmation quand la session a disparu", async () => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(lost);
    getSession.mockResolvedValue({ data: null, error: null });

    await submit("secret");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/deleted"));
    expect(resetAccountData).toHaveBeenCalled();
  });

  // Le compte est peut-être parti : le prochain 401 du sondage ouvrirait la reconnexion dessus.
  it("garde la relecture suspendue après une issue inconnue, jusqu'à quitter l'écran", async () => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(lost);
    const view = await open();
    await view.user.type(screen.getByLabelText(PASSWORD), "secret");
    await view.user.click(screen.getByRole("button", { name: SUBMIT }));

    await screen.findByText("common.error");
    expect(releaseSessionRecheck).not.toHaveBeenCalled();

    view.unmount();
    expect(releaseSessionRecheck).toHaveBeenCalledOnce();
  });

  // Le navigateur met du temps à charger la confirmation : ni bouton rallumé, ni erreur d'ici là.
  it("ne dit aucun échec pendant qu'elle quitte la page", async () => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(lost);
    getSession.mockResolvedValue({ data: null, error: null });

    await submit("secret");

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "account.delete.submitting" })).toBeDisabled();
    expect(screen.queryByText("common.error")).toBeNull();
    expect(releaseSessionRecheck).not.toHaveBeenCalled();
  });

  // Juste après la coupure, `/get-session` peut ne jamais répondre : le formulaire doit rendre la main.
  it("borne la relecture dans le temps", async () => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(lost);

    await submit("secret");

    await waitFor(() =>
      expect(getSession).toHaveBeenCalledWith({
        fetchOptions: { timeout: expect.any(Number) },
      }),
    );
  });

  // La relecture a échoué avec la même panne, ou le COMMIT n'était pas encore passé : le compte est
  // parti entre-temps, et demander le mot de passe d'un compte disparu serait absurde.
  it("part sur la confirmation si un nouvel essai reçoit un 401 après une issue inconnue", async () => {
    vi.mocked(accountErasureApi.erase).mockRejectedValueOnce(lost);
    getSession.mockResolvedValue({ data: null, error: { status: 502 } });
    const view = await open();
    await view.user.type(screen.getByLabelText(PASSWORD), "secret");
    await view.user.click(screen.getByRole("button", { name: SUBMIT }));
    await screen.findByText("common.error");

    vi.mocked(accountErasureApi.erase).mockRejectedValueOnce(
      new ApiError(401, "Unauthorized", null),
    );
    await view.user.click(screen.getByRole("button", { name: SUBMIT }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account/deleted"));
    expect(getSession).toHaveBeenCalledOnce();
  });

  // API injoignable : l'absence de réponse ne prouve rien, annoncer la suppression serait faux.
  it.each([
    ["la relecture échoue", { data: null, error: { status: 502 } }],
    ["la session est toujours là", { data: { user: {} }, error: null }],
  ])("reste sur le formulaire quand %s", async (_case, answer) => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(lost);
    getSession.mockResolvedValue(answer);

    await submit("secret");

    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(await screen.findByText("common.error")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("reste sur le formulaire quand la relecture lève", async () => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(lost);
    getSession.mockRejectedValue(new TypeError("réseau"));

    await submit("secret");

    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });

  // Ces réponses disent que rien n'a été supprimé : pas de relecture à faire.
  it.each([
    [
      "un mot de passe refusé",
      new ApiError(403, "Refus", null, true, ProblemType.ERASURE_PASSWORD_REJECTED),
    ],
    ["une session déjà perdue", new ApiError(401, "Unauthorized", null)],
    ["un refus de l'API", new ApiError(400, "Invalide", null)],
  ])("ne relit pas la session après %s", async (_case, failure) => {
    vi.mocked(accountErasureApi.erase).mockRejectedValue(failure);

    await submit("secret");

    await waitFor(() => expect(releaseSessionRecheck).toHaveBeenCalled());
    expect(getSession).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
