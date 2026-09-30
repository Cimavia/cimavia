import { fireEvent, waitFor } from "@testing-library/react";
import { router } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginScreen } from "@/feature/auth/screen/LoginScreen";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";
import { press, pressButton, renderRn } from "@/test/render";

vi.mock("@/shared/lib/account-reset", () => ({ resetAccountData: vi.fn(async () => undefined) }));

vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: vi.fn(),
    signIn: { email: vi.fn() },
  },
}));

const useSession = vi.mocked(authClient.useSession);
const signIn = vi.mocked(authClient.signIn.email);
const resetAccount = vi.mocked(resetAccountData);

const SUBMIT = "auth.login.submit";

function session(user: { isCoach: boolean; isAthlete: boolean } | null, isPending = false) {
  useSession.mockReturnValue({
    data: user == null ? null : { user: { id: "me", ...user } },
    isPending,
  } as never);
}

/** Les deux champs, dans l'ordre du formulaire — `CmvTextField` n'associe pas de `<label>`. */
function fillCredentials(container: HTMLElement): void {
  const [email, password] = container.querySelectorAll("input");
  if (email == null || password == null) throw new Error("champs introuvables");
  fireEvent.change(email, { target: { value: "lea@cmv.test" } });
  fireEvent.change(password, { target: { value: "motdepasse1" } });
}

const redirectOf = (container: HTMLElement) =>
  container.querySelector("[data-redirect]")?.getAttribute("data-redirect") ?? null;

beforeEach(() => {
  session(null);
  signIn.mockResolvedValue({ error: null } as never);
});

describe("LoginScreen — la garde de session", () => {
  /**
   * La destination DÉRIVE de la capacité : un `/planning` en dur envoyait un coach sur
   * `GET /me/plans`, qui est `@Roles([ATHLETE])`.
   */
  it.each([
    ["le coach vers son tableau de bord", { isCoach: true, isAthlete: false }, "/dashboard"],
    ["l'athlète vers sa planification", { isCoach: false, isAthlete: true }, "/planning"],
  ])("renvoie %s une fois connecté", (_, user, destination) => {
    session(user);

    const { container, queryByText } = renderRn(<LoginScreen />);

    expect(redirectOf(container)).toBe(destination);
    expect(queryByText(SUBMIT)).toBeNull();
  });

  /** Rien n'est décidé tant que la session n'est pas résolue : le formulaire reste en place. */
  it("garde le formulaire tant que la session se résout", () => {
    session({ isCoach: true, isAthlete: false }, true);

    const { container, queryByText } = renderRn(<LoginScreen />);

    expect(redirectOf(container)).toBeNull();
    expect(queryByText(SUBMIT)).not.toBeNull();
  });
});

describe("LoginScreen — la connexion", () => {
  it("envoie l'adresse et le mot de passe saisis", async () => {
    const { container } = renderRn(<LoginScreen />);
    fillCredentials(container);

    pressButton(container, SUBMIT);

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({ email: "lea@cmv.test", password: "motdepasse1" }),
    );
  });

  /**
   * Le seul point de passage OBLIGÉ d'un changement de compte : une session expirée ramène ici
   * sans qu'aucune déconnexion soit passée, et le cache du précédent serait resservi.
   */
  it("vide les données du compte précédent, sans naviguer lui-même", async () => {
    const { container } = renderRn(<LoginScreen />);
    fillCredentials(container);

    pressButton(container, SUBMIT);

    await waitFor(() => expect(resetAccount).toHaveBeenCalled());
    // C'est la garde de session qui aiguille, une fois la session résolue : un `replace` d'ici
    // partait avant elle, sur une route que la capacité n'autorisait pas forcément.
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("ferme le bouton pendant l'envoi, et le rouvre après", async () => {
    let settle: (value: { error: null }) => void = () => undefined;
    signIn.mockReturnValue(new Promise((resolve) => (settle = resolve)) as never);
    const { container, queryByText } = renderRn(<LoginScreen />);
    fillCredentials(container);

    pressButton(container, SUBMIT);

    await waitFor(() => expect(queryByText("auth.login.submitting")).not.toBeNull());
    settle({ error: null });
    await waitFor(() => expect(queryByText(SUBMIT)).not.toBeNull());
  });

  it("dit que les identifiants sont faux quand l'API les refuse, sans rien purger", async () => {
    signIn.mockResolvedValue({ error: { status: 401 } } as never);
    const { container, queryByText } = renderRn(<LoginScreen />);
    fillCredentials(container);

    pressButton(container, SUBMIT);

    await waitFor(() => expect(queryByText("auth.errors.invalidCredentials")).not.toBeNull());
    expect(resetAccount).not.toHaveBeenCalled();
  });

  /** Le réseau lève, le client Better Auth non : sans ce repli, l'écran resterait muet. */
  it("dit quelque chose même quand l'appel casse", async () => {
    signIn.mockRejectedValue(new Error("réseau coupé"));
    const { container, queryByText } = renderRn(<LoginScreen />);
    fillCredentials(container);

    pressButton(container, SUBMIT);

    await waitFor(() => expect(queryByText("auth.errors.generic")).not.toBeNull());
    expect(queryByText(SUBMIT)).not.toBeNull();
  });

  it("efface l'erreur précédente à la tentative suivante", async () => {
    signIn.mockResolvedValueOnce({ error: { status: 401 } } as never);
    const { container, queryByText } = renderRn(<LoginScreen />);
    fillCredentials(container);
    pressButton(container, SUBMIT);
    await waitFor(() => expect(queryByText("auth.errors.invalidCredentials")).not.toBeNull());

    pressButton(container, SUBMIT);

    await waitFor(() => expect(resetAccount).toHaveBeenCalled());
    expect(queryByText("auth.errors.invalidCredentials")).toBeNull();
  });
});

describe("LoginScreen — les liens", () => {
  it.each([
    ["auth.login.forgot", "/forgot-password"],
    ["auth.login.toRegister", "/register"],
  ])("%s mène à %s", (label, destination) => {
    const { getByText } = renderRn(<LoginScreen />);

    press(getByText(label));

    expect(router.push).toHaveBeenCalledWith(destination);
  });
});
