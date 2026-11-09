import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountDeletedScreen } from "@/feature/account/screen/AccountDeletedScreen";
import { renderInRoute } from "../../../../test/render";

const session = vi.hoisted(() => ({
  state: { data: null as unknown, isPending: false },
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => session.state },
}));

function open() {
  return renderInRoute(<AccountDeletedScreen />, {
    path: "/account/deleted",
    links: ["/", "/login"],
  });
}

beforeEach(() => {
  session.state = { data: null, isPending: false };
});

describe("AccountDeletedScreen", () => {
  it("confirme la suppression, et mène à la connexion", async () => {
    await open();

    expect(screen.getByText("account.deleted.message")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "account.deleted.toLogin" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  // Le temps que la session se résolve, rien ne dit encore qui lit : la confirmation attend.
  it("n'annonce rien tant que la session n'est pas résolue", async () => {
    session.state = { data: null, isPending: true };

    await open();

    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByText("account.deleted.message")).toBeNull();
  });

  // Rien n'a été supprimé pour lui : annoncer le contraire l'inquiéterait.
  it("renvoie à l'accueil un compte connecté", async () => {
    session.state = { data: { user: { id: "u-1" } }, isPending: false };

    const { router } = await open();

    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});
