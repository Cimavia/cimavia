import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordScreen } from "@/feature/auth/screen/ForgotPasswordScreen";
import { authClient } from "@/shared/lib/auth";
import { pressButton, renderRn } from "@/test/render";

vi.mock("@/shared/lib/auth", () => ({
  authClient: { requestPasswordReset: vi.fn() },
}));

const requestPasswordReset = vi.mocked(authClient.requestPasswordReset);

function submit(container: HTMLElement, email: string): void {
  const field = container.querySelector("input");
  if (field == null) throw new Error("champ e-mail introuvable");
  fireEvent.change(field, { target: { value: email } });
  pressButton(container, "auth.forgot.submit");
}

beforeEach(() => {
  requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null } as never);
});

describe("ForgotPasswordScreen (mobile)", () => {
  /**
   * Le défaut de #64 : sans `redirectTo`, Better Auth fabrique un lien vers l'API elle-même, et
   * l'athlète qui ouvre son e-mail tombe sur une page qui ne sait pas changer un mot de passe.
   * Le web n'avait pas le problème — il envoie sa propre origine.
   */
  it("demande la réinitialisation vers la page web, jamais sans destination", async () => {
    const { container } = renderRn(<ForgotPasswordScreen />);
    submit(container, "athlete@example.com");

    await vi.waitFor(() => expect(requestPasswordReset).toHaveBeenCalled());
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "athlete@example.com",
      redirectTo: "http://localhost:5173/reset-password",
    });
  });

  // On confirme toujours, même sur une adresse inconnue : une réponse différente révélerait quels
  // comptes existent. C'est l'écran qui porte cette garantie, pas l'API.
  it("confirme l'envoi sans jamais dire si le compte existe", async () => {
    const { container, queryByText } = renderRn(<ForgotPasswordScreen />);
    expect(queryByText("auth.forgot.sent")).toBeNull();

    submit(container, "inconnu@example.com");

    await vi.waitFor(() => expect(queryByText("auth.forgot.sent")).not.toBeNull());
  });

  /**
   * Le piège du client Better Auth : il ne LÈVE pas sur une réponse d'erreur, il la rend. Et le
   * refus le plus probable ici est justement celui du `redirectTo` ci-dessus — `originCheck` le
   * valide contre les `trustedOrigins` de l'API. Sans lecture de `error`, l'écran annoncerait
   * « e-mail envoyé » alors que rien n'est parti.
   */
  it("n'annonce pas un envoi quand l'api a refusé la destination", async () => {
    requestPasswordReset.mockResolvedValue({
      data: null,
      error: { status: 403, statusText: "FORBIDDEN", message: "Invalid redirectTo" },
    } as never);
    const { container, queryByText } = renderRn(<ForgotPasswordScreen />);

    submit(container, "athlete@example.com");

    await vi.waitFor(() => expect(queryByText("auth.errors.generic")).not.toBeNull());
    expect(queryByText("auth.forgot.sent")).toBeNull();
  });

  it("montre une erreur générique quand l'appel échoue", async () => {
    requestPasswordReset.mockRejectedValue(new Error("réseau"));
    const { container, queryByText } = renderRn(<ForgotPasswordScreen />);

    submit(container, "athlete@example.com");

    await vi.waitFor(() => expect(queryByText("auth.errors.generic")).not.toBeNull());
    expect(queryByText("auth.forgot.sent")).toBeNull();
  });
});
