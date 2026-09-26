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
    links: ["/login"],
  });
}

async function submit(view: Awaited<ReturnType<typeof setup>>) {
  await view.user.type(view.getByLabelText(PASSWORD), "nouveaumdp1");
  await view.user.click(view.getByRole("button", { name: SUBMIT }));
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
    expect(router.history.length).toBe(1);
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

  it("dit le lien invalide sans appeler l'API quand l'URL n'a pas de jeton", async () => {
    const view = await setup({});

    await submit(view);

    // Le cas d'une page rechargée : le jeton est parti de l'URL, il faut recliquer le lien du mail.
    expect(await view.findByText("auth.reset.invalidToken")).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("dit le lien invalide quand l'API refuse le jeton", async () => {
    resetPasswordMock.mockResolvedValue({ error: { status: 400 } });
    const view = await setup();

    await submit(view);

    expect(await view.findByText("auth.reset.invalidToken")).toBeInTheDocument();
    expect(view.getByRole("button", { name: SUBMIT })).toBeEnabled();
  });

  it("dit l'erreur générique quand l'appel échoue", async () => {
    resetPasswordMock.mockRejectedValue(new Error("réseau"));
    const view = await setup();

    await submit(view);

    expect(await view.findByText("auth.errors.generic")).toBeInTheDocument();
  });
});
