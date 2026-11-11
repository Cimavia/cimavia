import { ProblemType } from "@cmv/shared";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { type NetworkState, useNetworkState } from "expo-network";
import { router, useNavigation } from "expo-router";
import { BackHandler } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountErasureApi } from "@/feature/account/api";
import { DeleteAccountScreen } from "@/feature/account/screen/DeleteAccountScreen";
import { blockTrackingStore } from "@/feature/plan/lib/local-tracking-store";
import { SessionGuardContext } from "@/shared/hook/useSessionGuard";
import { resetAccountData } from "@/shared/lib/account-reset";
import { ApiError } from "@/shared/lib/api";
import { authClient } from "@/shared/lib/auth";
import { press, pressButton, renderRn } from "@/test/render";

/** Les gestes qui suivent le départ écrivent dans UN journal : c'est leur ORDRE qui compte. */
const { journal } = vi.hoisted(() => ({ journal: [] as string[] }));

vi.mock("@/feature/account/api", () => ({ accountErasureApi: { erase: vi.fn() } }));

vi.mock("@/feature/plan/lib/local-tracking-store", () => ({
  blockTrackingStore: {
    purge: vi.fn(async () => {
      journal.push("tracking");
    }),
  },
}));

vi.mock("@/shared/lib/account-reset", () => ({
  resetAccountData: vi.fn(async () => {
    journal.push("reset");
  }),
}));

vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: vi.fn(),
    getSession: vi.fn(),
    signOut: vi.fn(async () => {
      journal.push("signOut");
    }),
  },
}));

vi.mock("expo-network", () => ({ useNetworkState: vi.fn() }));

const SUBMIT = "account.delete.submit";
const erase = vi.mocked(accountErasureApi.erase);
const getSession = vi.mocked(authClient.getSession);
const signOut = vi.mocked(authClient.signOut);
const reset = vi.mocked(useNavigation().reset);

function session(user: Record<string, boolean> | null, isPending = false): void {
  vi.mocked(authClient.useSession).mockReturnValue({
    data: user == null ? null : { user: { id: "me", ...user } },
    isPending,
  } as never);
}

function networkIs(state: NetworkState): void {
  vi.mocked(useNetworkState).mockReturnValue(state);
}

const passwordField = () => document.querySelector("input") as HTMLInputElement;

function submit(password = "secret"): HTMLElement {
  const { container } = renderRn(<DeleteAccountScreen />);
  fireEvent.change(passwordField(), { target: { value: password } });
  pressButton(container, SUBMIT);
  return container;
}

const leftForLogin = () =>
  waitFor(() =>
    expect(reset).toHaveBeenCalledExactlyOnceWith({
      index: 0,
      routes: [{ name: "login", params: { erased: "1" } }],
    }),
  );

beforeEach(() => {
  journal.length = 0;
  session({ isAthlete: true });
  networkIs({ isConnected: true, isInternetReachable: true });
  erase.mockResolvedValue(undefined);
  getSession.mockResolvedValue({ data: { user: { id: "me" } }, error: null } as never);
  reset.mockImplementation(() => {
    journal.push("navigate");
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DeleteAccountScreen — ce qui est annoncé", () => {
  it("dit à un athlète ce qui part et ce qui reste", () => {
    renderRn(<DeleteAccountScreen />);

    expect(screen.getByText("account.delete.warning")).toBeTruthy();
    expect(screen.getByText("account.delete.gone.athlete")).toBeTruthy();
    expect(screen.getByText("account.delete.kept.athlete")).toBeTruthy();
    expect(screen.getByText("account.delete.backups")).toBeTruthy();
    expect(screen.queryByText("account.delete.gone.coach")).toBeNull();
  });

  // Une double capacité perd les deux côtés d'un coup : elle doit lire les deux.
  it("annonce les deux côtés d'un compte à double capacité", () => {
    session({ isCoach: true, isAthlete: true });

    renderRn(<DeleteAccountScreen />);

    expect(screen.getByText("account.delete.gone.coach")).toBeTruthy();
    expect(screen.getByText("account.delete.gone.athlete")).toBeTruthy();
    expect(screen.getByText("account.delete.kept.coach")).toBeTruthy();
  });

  it("n'annonce à l'Entreprise aucune facture conservée", () => {
    session({ isCompany: true });

    renderRn(<DeleteAccountScreen />);

    expect(screen.getByText("account.delete.gone.company")).toBeTruthy();
    expect(screen.queryByText("account.delete.kept.athlete")).toBeNull();
    expect(screen.getByText("account.delete.backups")).toBeTruthy();
  });

  it("garde le texte quand la session tombe sous l'écran", () => {
    const { rerender } = renderRn(<DeleteAccountScreen />);

    session(null);
    rerender(<DeleteAccountScreen />);

    expect(screen.getByText("account.delete.gone.athlete")).toBeTruthy();
    expect(document.querySelector("[data-redirect]")).toBeNull();
  });

  it("revient en arrière sans rien supprimer", () => {
    const { container } = renderRn(<DeleteAccountScreen />);

    press(container.querySelector('[data-icon="chevron-back"]') as Element);

    expect(router.back).toHaveBeenCalledOnce();
    expect(erase).not.toHaveBeenCalled();
  });
});

describe("DeleteAccountScreen — sans session", () => {
  it("renvoie vers la connexion un lien profond ouvert déconnecté", () => {
    session(null);

    const { container } = renderRn(<DeleteAccountScreen />);

    expect(container.querySelector("[data-redirect]")?.getAttribute("data-redirect")).toBe(
      "/login",
    );
  });

  it("ne décide rien tant que la session n'est pas résolue", () => {
    session(null, true);

    const { container } = renderRn(<DeleteAccountScreen />);

    expect(container.querySelector("[data-redirect]")).toBeNull();
    expect(screen.queryByText(SUBMIT)).toBeNull();
  });
});

describe("DeleteAccountScreen — le geste", () => {
  it("n'envoie rien sans mot de passe", () => {
    const { container } = renderRn(<DeleteAccountScreen />);

    pressButton(container, SUBMIT);

    expect(erase).not.toHaveBeenCalled();
  });

  /**
   * L'ordre est le contrat : la navigation vient après la purge, et l'effacement de la session passe
   * en dernier.
   */
  it("purge l'appareil, efface la session, puis ouvre la connexion", async () => {
    submit();

    await leftForLogin();

    expect(erase).toHaveBeenCalledExactlyOnceWith({ password: "secret" });
    expect(journal.slice(0, 2).sort()).toEqual(["reset", "tracking"]);
    expect(journal.slice(2)).toEqual(["signOut", "navigate"]);
    expect(signOut).toHaveBeenCalledExactlyOnceWith({
      fetchOptions: { timeout: expect.any(Number) },
    });
  });

  it("n'envoie qu'une fois sur un double appui", async () => {
    const container = submit();
    pressButton(container, SUBMIT);

    await leftForLogin();

    expect(erase).toHaveBeenCalledOnce();
  });

  it("reste éteint pendant le départ", async () => {
    let finish: () => void = () => undefined;
    erase.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve();
      }),
    );

    const container = submit();

    expect(await screen.findByText("account.delete.submitting")).toBeTruthy();
    press(container.querySelector('[data-icon="chevron-back"]') as Element);
    expect(router.back).not.toHaveBeenCalled();
    finish();
    await leftForLogin();
  });

  // Le chevron éteint ne suffit pas : Android et iOS ont chacun leur retour hors de l'écran.
  it("bloque le retour système le temps de l'envoi, puis le rend", async () => {
    const remove = vi.fn();
    const addListener = vi
      .spyOn(BackHandler, "addEventListener")
      .mockReturnValue({ remove } as never);
    const setOptions = vi.mocked(useNavigation().setOptions);
    let refuse: () => void = () => undefined;
    erase.mockReturnValue(
      new Promise((_resolve, reject) => {
        refuse = () => reject(new ApiError(429, "Non", null));
      }),
    );

    submit();

    await screen.findByText("account.delete.submitting");
    const [event, handler] = addListener.mock.calls[0] as [string, () => boolean];
    expect(event).toBe("hardwareBackPress");
    expect(handler()).toBe(true);
    expect(setOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
    expect(remove).not.toHaveBeenCalled();

    refuse();

    await screen.findByText("account.delete.failure.tooManyAttempts");
    expect(remove).toHaveBeenCalledOnce();
    expect(setOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  });

  // Le compte n'existe plus : annoncer un échec, ou rester sur l'écran, serait faux.
  it.each([
    [
      "signOut échoue, faute de réseau",
      () => signOut.mockRejectedValueOnce(new TypeError("réseau")),
    ],
    [
      "la purge résiste",
      () => vi.mocked(resetAccountData).mockRejectedValueOnce(new Error("AsyncStorage")),
    ],
    [
      "le suivi local résiste",
      () => vi.mocked(blockTrackingStore.purge).mockRejectedValueOnce(new Error("AsyncStorage")),
    ],
  ])("quitte l'écran même quand %s", async (_case, arrange) => {
    arrange();

    submit();

    await leftForLogin();
    expect(screen.queryByText("account.delete.failure.generic")).toBeNull();
  });
});

describe("DeleteAccountScreen — les refus", () => {
  const rejected = new ApiError(403, "Refus", null, true, ProblemType.ERASURE_PASSWORD_REJECTED);

  it("vide le champ sur un mot de passe refusé", async () => {
    erase.mockRejectedValue(rejected);

    submit();

    expect(await screen.findByText("account.delete.failure.wrongPassword")).toBeTruthy();
    expect(passwordField().value).toBe("");
    expect(reset).not.toHaveBeenCalled();
  });

  // Le mot de passe est bon : le faire retaper ne servirait à rien.
  it.each([
    [409, "account.delete.failure.busy"],
    [429, "account.delete.failure.tooManyAttempts"],
  ])("garde la saisie sur un %i", async (status, message) => {
    erase.mockRejectedValue(new ApiError(status, "Non", null));

    submit();

    expect(await screen.findByText(message)).toBeTruthy();
    expect(passwordField().value).toBe("secret");
  });

  // Un refus certain : le texte de l'issue inconnue enverrait vérifier un réseau sans rapport.
  it.each([400, 404])("dit le refus sur un %i", async (status) => {
    erase.mockRejectedValue(new ApiError(status, "Non", null, true));

    submit();

    expect(await screen.findByText("account.delete.failure.refused")).toBeTruthy();
    expect(reset).not.toHaveBeenCalled();
  });

  // La fenêtre de reconnexion en dit la cause : ici, seulement que rien n'a été supprimé.
  it("traite un 401 comme un refus, sans purger", async () => {
    erase.mockRejectedValue(new ApiError(401, "Unauthorized", null));

    submit();

    expect(await screen.findByText("account.delete.failure.refused")).toBeTruthy();
    expect(resetAccountData).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("DeleteAccountScreen — le départ annoncé (#439)", () => {
  const departure = { begin: vi.fn(), complete: vi.fn(), cancel: vi.fn() };

  function submitGuarded() {
    const view = renderRn(
      <SessionGuardContext.Provider value={{ retained: null, departure }}>
        <DeleteAccountScreen />
      </SessionGuardContext.Provider>,
    );
    fireEvent.change(passwordField(), { target: { value: "secret" } });
    pressButton(view.container, SUBMIT);
    return view;
  }

  beforeEach(() => {
    departure.begin.mockClear();
    departure.complete.mockClear();
    departure.cancel.mockClear();
  });

  // La session tombe au COMMIT, avant la réponse : annoncé après, le voile s'ouvrirait sur un compte disparu.
  it("l'annonce avant l'envoi, et le termine une fois sur la connexion", async () => {
    erase.mockImplementationOnce(async () => {
      expect(departure.begin).toHaveBeenCalledTimes(1);
    });

    submitGuarded();

    await waitFor(() => expect(departure.complete).toHaveBeenCalledTimes(1));
    expect(departure.cancel).not.toHaveBeenCalled();
  });

  // Le compte est peut-être parti : la fenêtre s'ouvrirait, et bloquerait l'essai qui le confirme.
  it("le maintient sur une issue inconnue, jusqu'à ce qu'on quitte l'écran", async () => {
    erase.mockRejectedValue(new TypeError("réseau"));
    const { unmount } = submitGuarded();

    expect(await screen.findByText("account.delete.failure.generic")).toBeTruthy();
    expect(departure.cancel).not.toHaveBeenCalled();

    unmount();
    expect(departure.cancel).toHaveBeenCalledTimes(1);
  });

  it("l'annule sur un refus : le compte est toujours là", async () => {
    erase.mockRejectedValue(new ApiError(400, "Non", null, true));

    submitGuarded();

    await waitFor(() => expect(departure.cancel).toHaveBeenCalledTimes(1));
    expect(departure.complete).not.toHaveBeenCalled();
  });
});

describe("DeleteAccountScreen — le réseau", () => {
  // Parti hors ligne, l'envoi attendrait le réseau et supprimerait le compte bien plus tard.
  it("dit qu'il faut du réseau, et éteint le geste", () => {
    networkIs({ isConnected: false, isInternetReachable: false });

    submit();

    expect(screen.getByText("account.delete.offline")).toBeTruthy();
    expect(erase).not.toHaveBeenCalled();
  });

  // La sonde n'a pas abouti : bloquer sur un « je ne sais pas » priverait du geste sans raison.
  it("laisse le geste tant que le réseau est indéterminé", async () => {
    networkIs({});

    submit();

    await leftForLogin();
    expect(screen.queryByText("account.delete.offline")).toBeNull();
  });

  // Une coupure en plein envoi le laisse pendu, et le retour système est bloqué : l'écran serait figé.
  it("rend la main quand l'envoi n'aboutit jamais", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    erase.mockReturnValue(new Promise(() => undefined));

    submit();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(await screen.findByText("account.delete.failure.generic")).toBeTruthy();
    expect(reset).not.toHaveBeenCalled();
  });

  // Le compte part au COMMIT : sans la relecture, la personne lirait un échec sur un compte disparu.
  it("part sur la connexion quand la réponse se perd et que la session n'existe plus", async () => {
    erase.mockRejectedValue(new TypeError("Network request failed"));
    getSession.mockResolvedValue({ data: null, error: null } as never);

    submit();

    await leftForLogin();
    expect(journal).toContain("reset");
  });

  it("dit l'échec quand la réponse se perd et que la session existe encore", async () => {
    erase.mockRejectedValue(new TypeError("Network request failed"));

    submit();

    expect(await screen.findByText("account.delete.failure.generic")).toBeTruthy();
    expect(passwordField().value).toBe("secret");
    expect(reset).not.toHaveBeenCalled();
  });
});
