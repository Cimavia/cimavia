import { describe, expect, it } from "vitest";
import type { VerifyEmailOutcome } from "@/routes/verify-email";
import { renderInRoute } from "../../../../test/render";
import { VerifyEmailScreen } from "./VerifyEmailScreen";

function setup(outcome: VerifyEmailOutcome) {
  return renderInRoute(<VerifyEmailScreen />, {
    path: "/verify-email",
    // Ce que `validateSearch` aurait tiré de `?error=…`.
    search: { outcome },
    links: ["/login", "/forgot-password"],
  });
}

describe("VerifyEmailScreen (#270)", () => {
  it("confirme l'adresse et invite à se connecter", async () => {
    const view = await setup("verified");

    expect(view.getByText("auth.verifyEmail.success")).toBeInTheDocument();
    expect(view.queryByText("auth.verifyEmail.invalid")).not.toBeInTheDocument();
    expect(view.getByRole("link", { name: "auth.verifyEmail.toLogin" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  // La suite est la même pour un lien expiré ou falsifié : se connecter en renvoie un neuf.
  it("dit que le lien n'a pas servi, et mène quand même à la connexion", async () => {
    const view = await setup("failed");

    expect(view.getByRole("alert")).toHaveTextContent("auth.verifyEmail.invalid");
    expect(view.getByRole("link", { name: "auth.verifyEmail.toLogin" })).toBeInTheDocument();
  });

  // Se connecter échouerait en 401 : le compte n'a plus de mot de passe à vérifier.
  it("mène au choix d'un mot de passe quand le compte n'en a plus", async () => {
    const view = await setup("passwordRequired");

    expect(view.getByRole("alert")).toHaveTextContent("auth.verifyEmail.passwordRequired");
    expect(view.getByRole("link", { name: "auth.verifyEmail.toForgotPassword" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(view.queryByRole("link", { name: "auth.verifyEmail.toLogin" })).not.toBeInTheDocument();
  });
});
