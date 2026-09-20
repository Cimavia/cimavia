import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterScreen } from "@/feature/auth/screen/RegisterScreen";
import { resetAccountData } from "@/shared/lib/account-reset";
import { authClient } from "@/shared/lib/auth";
import { pressButton, renderRn } from "@/test/render";

// Expo Router porte la navigation, que cet écran ne fait QUE déléguer : la redirection d'après
// inscription est le fait de la garde de session, pas d'un `replace` d'ici (cf. le commentaire de
// `onSubmit`). Le double sert donc à monter le composant, pas à affirmer quoi que ce soit.
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  Redirect: () => null,
}));

vi.mock("@/shared/lib/account-reset", () => ({ resetAccountData: vi.fn(async () => undefined) }));

vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: vi.fn(),
    signUp: { email: vi.fn() },
  },
}));

const useSession = vi.mocked(authClient.useSession);
const signUp = vi.mocked(authClient.signUp.email);
const resetAccount = vi.mocked(resetAccountData);

const SUBMIT = "auth.register.submit";
const ATHLETE = "auth.register.capabilityAthlete";

/** Les trois champs, dans l'ordre du formulaire — `CmvTextField` n'associe pas de `<label>`. */
function fillIdentity(container: HTMLElement): void {
  const [name, email, password] = container.querySelectorAll("input");
  if (name == null || email == null || password == null) throw new Error("champs introuvables");
  fireEvent.change(name, { target: { value: "Léa" } });
  fireEvent.change(email, { target: { value: "lea@cmv.test" } });
  fireEvent.change(password, { target: { value: "motdepasse1" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  useSession.mockReturnValue({ data: null, isPending: false } as never);
  signUp.mockResolvedValue({ error: null } as never);
});

describe("RegisterScreen (mobile)", () => {
  it("envoie les capacités cochées, jamais un rôle", async () => {
    const { container } = renderRn(<RegisterScreen />);
    fillIdentity(container);

    pressButton(container, SUBMIT);

    // `role` n'est plus envoyé depuis #12 : l'API le DÉDUIT des capacités. Le renvoyer d'ici
    // rouvrirait la porte fermée alors — un client capable de poser un persona incohérent.
    await vi.waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        name: "Léa",
        email: "lea@cmv.test",
        password: "motdepasse1",
        isCoach: false,
        isAthlete: true,
      }),
    );
  });

  it("vide le cache du compte précédent avant de laisser entrer", async () => {
    const { container } = renderRn(<RegisterScreen />);
    fillIdentity(container);

    pressButton(container, SUBMIT);

    // Le seul point de passage OBLIGÉ d'un changement de compte sur un téléphone : sans cette
    // purge, les données persistées du compte d'avant seraient resservies au nouveau.
    await vi.waitFor(() => expect(resetAccount).toHaveBeenCalled());
  });

  it("refuse une inscription sans aucune capacité, sans appeler l'API", async () => {
    const { container, queryByText } = renderRn(<RegisterScreen />);
    fillIdentity(container);

    // Athlète est cochée au départ (le cas le plus courant : un athlète invité par son coach
    // n'a rien à toucher). La décocher ne laisse aucune capacité.
    pressButton(container, ATHLETE);
    pressButton(container, SUBMIT);

    await vi.waitFor(() => expect(queryByText("auth.errors.noCapability")).not.toBeNull());
    expect(signUp).not.toHaveBeenCalled();
  });

  describe("ce que dit l'échec", () => {
    /**
     * LE cas de #263 côté téléphone, et la raison de cette table. Le message générique ferait
     * recommencer une saisie juste, indéfiniment : l'APK porte l'URL de l'environnement en dur,
     * aucune tentative ne passera. 422 est le seul code que Better Auth réserve à l'e-mail déjà
     * pris ; les autres validations sont des 400, donc génériques.
     */
    it.each([
      [403, "auth.errors.signupClosed"],
      [422, "auth.errors.emailInUse"],
      [400, "auth.errors.generic"],
    ])("traduit le refus %s en %s", async (status, message) => {
      signUp.mockResolvedValue({ error: { status } } as never);
      const { container, queryByText } = renderRn(<RegisterScreen />);
      fillIdentity(container);

      pressButton(container, SUBMIT);

      await vi.waitFor(() => expect(queryByText(message)).not.toBeNull());
    });

    /**
     * Le client Better Auth ne lève pas sur une réponse d'erreur, il la rend — mais le réseau,
     * lui, lève. Sur un téléphone c'est le cas ORDINAIRE (tunnel, ascenseur, salle de bloc au
     * sous-sol) : sans ce `catch`, l'écran resterait muet et on recliquerait.
     */
    it("dit quelque chose même quand l'appel casse", async () => {
      signUp.mockRejectedValue(new Error("réseau coupé"));
      const { container, queryByText } = renderRn(<RegisterScreen />);
      fillIdentity(container);

      pressButton(container, SUBMIT);

      await vi.waitFor(() => expect(queryByText("auth.errors.generic")).not.toBeNull());
    });
  });
});
