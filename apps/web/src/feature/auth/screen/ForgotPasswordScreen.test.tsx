import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";

const { requestPasswordResetMock } = vi.hoisted(() => ({ requestPasswordResetMock: vi.fn() }));

// Better Auth est coupé : ce qui est vérifié est ce que l'écran LUI demande, et ce qu'il fait de
// sa réponse.
vi.mock("@/shared/lib/auth", () => ({
  authClient: { requestPasswordReset: requestPasswordResetMock },
}));

const EMAIL = "common.email";
const SUBMIT = "auth.forgot.submit";

async function submit(email = "lea@example.com") {
  const view = await renderInRoute(<ForgotPasswordScreen />, {
    path: "/forgot-password",
    links: ["/login"],
  });
  await view.user.type(view.getByLabelText(EMAIL), email);
  await view.user.click(view.getByRole("button", { name: SUBMIT }));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  requestPasswordResetMock.mockResolvedValue({ data: { status: true }, error: null });
});

describe("ForgotPasswordScreen", () => {
  it("offre le retour à la connexion", async () => {
    const { getByRole } = await renderInRoute(<ForgotPasswordScreen />, {
      path: "/forgot-password",
      links: ["/login"],
    });

    expect(getByRole("link", { name: "auth.forgot.back" })).toHaveAttribute("href", "/login");
  });

  // Le lien du mail doit ramener sur CE site : c'est l'écran de réinitialisation qui lit le jeton.
  it("demande le lien pour l'adresse saisie, vers la page de réinitialisation", async () => {
    const { findByText, queryByLabelText } = await submit();

    expect(requestPasswordResetMock).toHaveBeenCalledWith({
      email: "lea@example.com",
      redirectTo: `${window.location.origin}/reset-password`,
    });
    expect(await findByText("auth.forgot.sent")).toBeInTheDocument();
    // Envoyé, le formulaire s'efface : le renvoyer n'apporterait qu'un second mail.
    expect(queryByLabelText(EMAIL)).toBeNull();
  });

  it("dit l'envoi en cours, bouton éteint", async () => {
    requestPasswordResetMock.mockReturnValue(new Promise(() => {}));

    const { findByRole } = await submit();

    expect(await findByRole("button", { name: "auth.forgot.submitting" })).toBeDisabled();
  });

  /**
   * Better Auth REND l'erreur au lieu de la lever : sans lecture, une panne s'annoncerait
   * « e-mail envoyé ». Une adresse inconnue, elle, répond comme une connue — pas d'énumération.
   */
  it.each([
    [
      "rendue par Better Auth",
      () => requestPasswordResetMock.mockResolvedValue({ error: { status: 500 } }),
    ],
    ["levée par le réseau", () => requestPasswordResetMock.mockRejectedValue(new Error("réseau"))],
  ])("dit la panne %s, sans annoncer d'envoi", async (_how, fail) => {
    fail();

    const { findByText, queryByText, getByRole } = await submit();

    expect(await findByText("auth.errors.generic")).toBeInTheDocument();
    expect(queryByText("auth.forgot.sent")).toBeNull();
    expect(getByRole("button", { name: SUBMIT })).toBeEnabled();
  });

  it("efface l'erreur précédente au nouvel essai", async () => {
    requestPasswordResetMock.mockResolvedValueOnce({ error: { status: 500 } });
    const { user, getByRole, findByText, queryByText } = await submit();
    await findByText("auth.errors.generic");

    await user.click(getByRole("button", { name: SUBMIT }));

    expect(await findByText("auth.forgot.sent")).toBeInTheDocument();
    expect(queryByText("auth.errors.generic")).toBeNull();
  });
});
