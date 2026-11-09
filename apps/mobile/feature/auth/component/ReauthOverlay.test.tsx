import { fireEvent, screen, waitFor } from "@testing-library/react";
import { router } from "expo-router";
import { BackHandler, Keyboard } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionGuardContext } from "@/shared/hook/useSessionGuard";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";
import { press, pressButton, renderRn } from "@/test/render";
import { ReauthOverlay } from "./ReauthOverlay";

vi.mock("@/shared/lib/account-reset", () => ({ resetAccountData: vi.fn(async () => undefined) }));
vi.mock("@/shared/lib/auth", () => ({ authClient: { signIn: { email: vi.fn() } } }));

const OWNER = { id: "lea", email: "lea@cmv.test", isAthlete: true };
const SUBMIT = "auth.reauth.submit";
const signIn = vi.mocked(authClient.signIn.email);
const complete = vi.fn();

function setup() {
  const view = renderRn(
    <SessionGuardContext.Provider
      value={{ retained: null, departure: { begin: vi.fn(), complete, cancel: vi.fn() } }}
    >
      <ReauthOverlay owner={OWNER} />
    </SessionGuardContext.Provider>,
  );
  const invalidate = vi.spyOn(view.queryClient, "invalidateQueries");
  return { ...view, invalidate };
}

function submit(container: HTMLElement): void {
  const field = container.querySelector("input");
  if (field == null) throw new Error("champ introuvable");
  fireEvent.change(field, { target: { value: "motdepasse1" } });
  pressButton(container, SUBMIT);
}

beforeEach(() => {
  vi.clearAllMocks();
  signIn.mockResolvedValue({ data: { user: { id: "lea" } }, error: null } as never);
});

describe("ReauthOverlay", () => {
  // On ne reprend l'écran que sous le compte qui l'a ouvert : l'e-mail se lit, il ne se saisit pas.
  it("montre le compte et ne demande que le mot de passe", () => {
    const { container } = setup();

    expect(screen.getByText("lea@cmv.test")).toBeTruthy();
    expect(container.querySelectorAll("input")).toHaveLength(1);
  });

  it("ferme le clavier de l'écran du dessous et bloque le retour système", () => {
    const dismiss = vi.spyOn(Keyboard, "dismiss");
    const addListener = vi.spyOn(BackHandler, "addEventListener");

    setup();

    expect(dismiss).toHaveBeenCalled();
    const [event, handler] = addListener.mock.calls[0] ?? [];
    expect(event).toBe("hardwareBackPress");
    expect(handler?.()).toBe(true);
  });

  it("reprend l'écran sur le même compte : relance les lectures, sans purger ni partir", async () => {
    const { container, invalidate } = setup();

    submit(container);

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledExactlyOnceWith({
      email: "lea@cmv.test",
      password: "motdepasse1",
    });
    expect(resetAccountData).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("dit qu'un mot de passe est faux, et garde l'écran", async () => {
    signIn.mockResolvedValue({ data: null, error: { status: 401 } } as never);
    const { container, invalidate } = setup();

    submit(container);

    expect(await screen.findByText("auth.errors.invalidCredentials")).toBeTruthy();
    expect(invalidate).not.toHaveBeenCalled();
    expect(resetAccountData).not.toHaveBeenCalled();
  });

  it("reste ouverte sur une panne réseau, avec le message générique", async () => {
    signIn.mockRejectedValue(new TypeError("réseau"));
    const { container } = setup();

    submit(container);

    expect(await screen.findByText("auth.errors.generic")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  // Le travail du premier compte ne s'affiche pas sous l'identité d'un autre.
  it("repart de zéro si l'adresse mène à un autre compte", async () => {
    signIn.mockResolvedValue({ data: { user: { id: "tom" } }, error: null } as never);
    const { container, invalidate } = setup();

    submit(container);

    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(resetAccountData).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/login");
    expect(invalidate).not.toHaveBeenCalled();
  });

  // Le retour est bloqué : sans ce repli, seule la fermeture de l'app en sortirait.
  it("« Changer de compte » aboutit même si la purge résiste", async () => {
    vi.mocked(resetAccountData).mockRejectedValueOnce(new Error("disque"));
    setup();

    press(screen.getByText("auth.reauth.switchAccount"));

    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("« Changer de compte » purge, part vers la connexion, puis oublie le compte", async () => {
    const steps: string[] = [];
    vi.mocked(resetAccountData).mockImplementationOnce(async () => {
      steps.push("purge");
    });
    vi.mocked(router.replace).mockImplementationOnce(() => {
      steps.push("login");
    });
    complete.mockImplementationOnce(() => {
      steps.push("oubli");
    });
    setup();

    press(screen.getByText("auth.reauth.switchAccount"));

    await waitFor(() => expect(steps).toEqual(["purge", "login", "oubli"]));
    expect(signIn).not.toHaveBeenCalled();
  });
});
