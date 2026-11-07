import { describe, expect, it } from "vitest";
import { renderInRoute } from "../../../../test/render";
import { VerifyEmailScreen } from "./VerifyEmailScreen";

function setup(failed: boolean) {
  return renderInRoute(<VerifyEmailScreen />, {
    path: "/verify-email",
    // Le routeur relit `?failed=true` en booléen, comme le ferait `validateSearch`.
    search: { failed: String(failed) },
    links: ["/login"],
  });
}

describe("VerifyEmailScreen (#270)", () => {
  it("confirme l'adresse et invite à se connecter", async () => {
    const view = await setup(false);

    expect(view.getByText("auth.verifyEmail.success")).toBeInTheDocument();
    expect(view.queryByText("auth.verifyEmail.invalid")).not.toBeInTheDocument();
    expect(view.getByRole("link", { name: "auth.verifyEmail.toLogin" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  // La suite est la même pour un lien expiré ou falsifié : se connecter en renvoie un neuf.
  it("dit que le lien n'a pas servi, et mène quand même à la connexion", async () => {
    const view = await setup(true);

    expect(view.getByRole("alert")).toHaveTextContent("auth.verifyEmail.invalid");
    expect(view.getByRole("link", { name: "auth.verifyEmail.toLogin" })).toBeInTheDocument();
  });
});
