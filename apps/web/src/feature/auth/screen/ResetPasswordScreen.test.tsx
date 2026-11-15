import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { ResetPasswordScreen } from "./ResetPasswordScreen";

const { resetPasswordMock } = vi.hoisted(() => ({ resetPasswordMock: vi.fn() }));

// Better Auth est coupé : ce qui est vérifié est ce que l'écran LUI demande, et ce qu'il fait de
// sa réponse.
vi.mock("@/shared/lib/auth", () => ({
  authClient: { resetPassword: resetPasswordMock },
}));

const PASSWORD = "auth.reset.newPassword";
const SUBMIT = "auth.reset.submit";

function setup(search: Readonly<Record<string, string>> = { token: "jeton-du-mail" }) {
  return renderInRoute(<ResetPasswordScreen />, {
    path: "/reset-password",
    search,
    links: ["/login", "/forgot-password"],
  });
}

async function submit(view: Awaited<ReturnType<typeof setup>>) {
  await view.user.type(view.getByLabelText(PASSWORD), "nouveaumdp1");
  await view.user.click(view.getByRole("button", { name: SUBMIT }));
}

/** Plus de formulaire, un lien vers un nouvel e-mail, et la connexion toujours à portée. */
function expectDeadLink(view: Awaited<ReturnType<typeof setup>>) {
  expect(view.queryByLabelText(PASSWORD)).not.toBeInTheDocument();
  expect(view.getByRole("link", { name: "auth.reset.toForgotPassword" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  expect(view.getByRole("link", { name: "auth.reset.toLogin" })).toHaveAttribute("href", "/login");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetPasswordMock.mockResolvedValue({ error: null });
});

describe("ResetPasswordScreen", () => {
  it("retire le jeton de l'URL dès son arrivée, sans ajouter d'entrée à l'historique", async () => {
    const { router } = await setup();

    // Tant qu'il y reste, toute erreur l'emporterait chez Sentry avec l'URL (#335).
    await waitFor(() => expect(router.state.location.href).toBe("/reset-password"));
    // `replace` : Retour ne ramène pas l'URL qui le portait.
    expect(router.history).toHaveLength(1);
  });

  it("envoie le jeton lu avant qu'il ne quitte l'URL", async () => {
    const view = await setup();
    await waitFor(() => expect(view.router.state.location.href).toBe("/reset-password"));

    await submit(view);

    await waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith({
        newPassword: "nouveaumdp1",
        token: "jeton-du-mail",
      }),
    );
    expect(await view.findByText("auth.reset.success")).toBeInTheDocument();
  });

  // Better Auth a vérifié le jeton AVANT de rediriger, et l'a trouvé inconnu, consommé ou expiré.
  it("dit d'emblée le lien mort quand Better Auth l'a refusé, et mène à un nouvel e-mail", async () => {
    const view = await setup({ error: "INVALID_TOKEN" });

    expectDeadLink(view);
    expect(view.getByRole("alert")).toHaveTextContent("auth.reset.invalidToken");
    // Rien de secret : `error` reste, et une page rechargée redit la même chose.
    expect(view.router.state.location.href).toBe("/reset-password?error=INVALID_TOKEN");
  });

  // Page rechargée après que le jeton a quitté l'URL (#335), ou adresse tapée à la main : le lien
  // de l'e-mail marche peut-être encore, le texte ne doit pas le déclarer mort.
  it("dit d'emblée qu'il manque le lien quand l'URL n'a ni jeton ni erreur", async () => {
    const view = await setup({});

    expectDeadLink(view);
    // `getByText` : le conteneur des toasts porte lui aussi `role="status"`.
    expect(view.getByText("auth.reset.missingToken")).toHaveAttribute("role", "status");
    expect(view.queryByText("auth.reset.invalidToken")).not.toBeInTheDocument();
  });

  it("ôte quand même le jeton de l'URL quand une erreur l'accompagne", async () => {
    // Better Auth ne pose jamais les deux : l'URL est fabriquée, le lien y est tenu pour mort.
    const view = await setup({ token: "jeton-du-mail", error: "INVALID_TOKEN" });

    await waitFor(() =>
      expect(view.router.state.location.href).toBe("/reset-password?error=INVALID_TOKEN"),
    );
    expectDeadLink(view);
    expect(view.getByRole("alert")).toHaveTextContent("auth.reset.invalidToken");
  });

  // Jeton consommé ou expiré pendant que la page restait ouverte, ou compte supprimé depuis l'envoi
  // de l'e-mail (#256) : le lien est mort, quoi qu'on tape.
  it.each(["INVALID_TOKEN", "USER_NOT_FOUND"])(
    "remplace le formulaire par le lien mort quand l'API refuse le jeton (%s)",
    async (code) => {
      resetPasswordMock.mockResolvedValue({ error: { status: 400, code } });
      const view = await setup();

      await submit(view);

      expect(await view.findByRole("alert")).toHaveTextContent("auth.reset.invalidToken");
      expectDeadLink(view);
      // Dans l'URL et non dans un état : une page rechargée redit que le lien est mort.
      expect(view.router.state.location.href).toBe("/reset-password?error=INVALID_TOKEN");
      expect(view.router.history).toHaveLength(1);
    },
  );

  // Le lien marche encore : dire le contraire ferait redemander un e-mail pour rien.
  it.each([
    ["auth.reset.passwordTooLong", { status: 400, code: "PASSWORD_TOO_LONG" }],
    ["auth.errors.tooManyAttempts", { status: 429 }],
    ["auth.errors.generic", { status: 500, code: "INTERNAL_SERVER_ERROR" }],
  ])("dit %s pour un refus qui ne tient pas au lien", async (message, error) => {
    resetPasswordMock.mockResolvedValue({ error });
    const view = await setup();

    await submit(view);

    expect(await view.findByText(message)).toBeInTheDocument();
    expect(view.queryByText("auth.reset.invalidToken")).not.toBeInTheDocument();
  });

  it("ne tronque pas un mot de passe trop long : c'est l'API qui le refuse", async () => {
    // Un `maxLength` couperait en silence un mot de passe collé ou généré, et le gestionnaire
    // retiendrait autre chose que celui du compte.
    const view = await setup();

    expect(view.getByLabelText(PASSWORD)).not.toHaveAttribute("maxLength");
  });

  it("dit l'erreur générique quand l'appel échoue", async () => {
    resetPasswordMock.mockRejectedValue(new Error("réseau"));
    const view = await setup();

    await submit(view);

    expect(await view.findByText("auth.errors.generic")).toBeInTheDocument();
  });
});
