import { router } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerificationSent } from "@/feature/auth/component/VerificationSent";
import { authClient } from "@/shared/lib/auth";
import { pressButton, renderRn } from "@/test/render";

vi.mock("@/shared/lib/auth", () => ({
  authClient: { sendVerificationEmail: vi.fn() },
}));

const sendVerificationEmail = vi.mocked(authClient.sendVerificationEmail);

const EMAIL = "lea@cmv.test";
const RESEND = "auth.verificationSent.resend";

beforeEach(() => {
  vi.clearAllMocks();
  sendVerificationEmail.mockResolvedValue({ error: null } as never);
});

describe("VerificationSent (mobile) — l'e-mail à ouvrir (#270)", () => {
  it("renvoie le lien à l'adresse saisie, sans nommer de retour", async () => {
    const { container, queryByText } = renderRn(<VerificationSent email={EMAIL} />);

    pressButton(container, RESEND);

    await vi.waitFor(() => expect(queryByText("auth.verificationSent.resent")).not.toBeNull());
    // Pas de `callbackURL` : c'est l'API qui décide où le lien ramène.
    expect(sendVerificationEmail).toHaveBeenCalledWith({ email: EMAIL });
  });

  /** Le client Better Auth rend l'erreur sans lever : la lire, sinon un refus dirait « renvoyé ». */
  it("dit l'échec quand l'API refuse le renvoi", async () => {
    sendVerificationEmail.mockResolvedValue({ error: { status: 429 } } as never);
    const { container, queryByText } = renderRn(<VerificationSent email={EMAIL} />);

    pressButton(container, RESEND);

    await vi.waitFor(() => expect(queryByText("auth.errors.generic")).not.toBeNull());
    expect(queryByText("auth.verificationSent.resent")).toBeNull();
  });

  it("dit l'échec quand l'appel casse", async () => {
    sendVerificationEmail.mockRejectedValue(new Error("réseau coupé"));
    const { container, queryByText } = renderRn(<VerificationSent email={EMAIL} />);

    pressButton(container, RESEND);

    await vi.waitFor(() => expect(queryByText("auth.errors.generic")).not.toBeNull());
  });

  it("annonce l'envoi en cours, sans permettre un second envoi", async () => {
    let settle: (value: { error: null }) => void = () => undefined;
    sendVerificationEmail.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }) as never,
    );
    const { container, queryByText } = renderRn(<VerificationSent email={EMAIL} />);

    pressButton(container, RESEND);

    await vi.waitFor(() => expect(queryByText("auth.verificationSent.resending")).not.toBeNull());
    expect(queryByText(RESEND)).toBeNull();
    settle({ error: null });
    await vi.waitFor(() => expect(queryByText(RESEND)).not.toBeNull());
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("mène à la connexion", () => {
    const { getByText } = renderRn(<VerificationSent email={EMAIL} />);

    getByText("auth.verificationSent.toLogin").click();

    expect(router.push).toHaveBeenCalledWith("/login");
  });
});
