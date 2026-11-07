import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { VerificationSent } from "./VerificationSent";

const { sendVerificationEmailMock } = vi.hoisted(() => ({
  sendVerificationEmailMock: vi.fn(),
}));

vi.mock("@/shared/lib/auth", () => ({
  authClient: { sendVerificationEmail: sendVerificationEmailMock },
}));

const RESEND = "auth.verificationSent.resend";

function setup() {
  return renderInRoute(<VerificationSent email="lea@example.test" />, {
    path: "/register",
    links: ["/login"],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendVerificationEmailMock.mockResolvedValue({ error: null });
});

describe("VerificationSent (#270)", () => {
  it("dit où l'e-mail est parti, et mène à la connexion", async () => {
    const view = await setup();

    expect(view.getByText("auth.verificationSent.body")).toBeInTheDocument();
    expect(view.getByRole("link", { name: "auth.verificationSent.toLogin" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  // Sans `callbackURL` : c'est l'API qui décide où le lien ramène.
  it("renvoie le lien à la même adresse, et le confirme", async () => {
    const view = await setup();

    await view.user.click(view.getByRole("button", { name: RESEND }));

    expect(sendVerificationEmailMock).toHaveBeenCalledExactlyOnceWith({
      email: "lea@example.test",
    });
    expect(await view.findByText("auth.verificationSent.resent")).toBeInTheDocument();
  });

  // Le client Better Auth rend l'erreur sans lever : un refus ne doit pas se lire « c'est reparti ».
  it.each([
    [
      "un refus de l'api",
      () => sendVerificationEmailMock.mockResolvedValue({ error: { status: 429 } }),
    ],
    ["une panne réseau", () => sendVerificationEmailMock.mockRejectedValue(new Error("coupé"))],
  ])("signale %s", async (_, arm) => {
    arm();
    const view = await setup();

    await view.user.click(view.getByRole("button", { name: RESEND }));

    expect(await view.findByRole("alert")).toHaveTextContent("auth.errors.generic");
    expect(view.queryByText("auth.verificationSent.resent")).not.toBeInTheDocument();
  });
});
