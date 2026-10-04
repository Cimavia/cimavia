import {
  type AnyRouter,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { CmvLeaveDialog } from "@/shared/component";
import { confirmLeave, useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { renderInRoute, renderWithProviders } from "../../../test/render";

const STAY = "common.leave.stay";
const LEAVE = "common.leave.leave";

/** Un écran minimal : une saisie à salir, et un enregistrement qui libère la sortie. */
function Editor() {
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty);
  return (
    <>
      <button type="button" onClick={() => setDirty(true)}>
        edit
      </button>
      <button type="button" onClick={guard.release}>
        saved
      </button>
      <CmvLeaveDialog {...guard.dialog} />
    </>
  );
}

const mount = () => renderInRoute(<Editor />, { path: "/edit", links: ["/other"] });

// Par l'historique et non par un lien : c'est lui qui porte les blocages, quel que soit le geste
// qui navigue — lien, `navigate`, retour arrière.
function go(router: AnyRouter, href: string) {
  act(() => {
    router.history.push(href);
  });
}

describe("useLeaveGuard", () => {
  it("laisse partir sans friction un écran sans saisie", async () => {
    const { router } = await mount();

    go(router, "/other");

    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("retient une saisie non enregistrée, et « Rester » ne bouge pas", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/other");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: STAY }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/edit");
  });

  it("part quand le coach confirme vouloir perdre sa saisie", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/other");
    await user.click(await screen.findByRole("button", { name: LEAVE }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
  });

  // Échap déclenche `cancel` : sans le rattraper, la fenêtre se fermerait et la navigation
  // resterait suspendue — ni partie, ni refusée.
  it("traite Échap comme « Rester »", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/other");
    const dialog = await screen.findByRole("dialog");
    act(() => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/edit");
  });

  // Après un enregistrement, l'écran part AVANT de s'être redessiné : la garde ne doit pas le
  // retenir sur une saisie qui vient justement de partir.
  it("laisse passer une sortie libérée", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));
    await user.click(screen.getByRole("button", { name: "saved" }));

    go(router, "/other");

    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // Un paramètre réécrit sur place (le `?add` lu puis retiré, #303) ne fait rien perdre.
  it("ne retient pas un changement de paramètre sur la même page", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/edit?add=ex-1");

    await waitFor(() => expect(router.state.location.searchStr).toBe("?add=ex-1"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * Se déconnecter, changer de compte : ces sorties AGISSENT avant de naviguer, et demandent donc
 * d'abord. La réponse dit si l'on peut agir.
 */
describe("confirmLeave", () => {
  it("répond oui d'emblée sans écran gardé", async () => {
    await expect(confirmLeave()).resolves.toBe(true);
  });

  it("répond oui d'emblée sur un écran sans saisie", async () => {
    await mount();

    await expect(confirmLeave()).resolves.toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("répond non sur « Rester », et l'écran reste gardé", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    const answer = confirmLeave();
    await user.click(await screen.findByRole("button", { name: STAY }));

    await expect(answer).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    go(router, "/other");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  // La navigation qui suit la déconnexion ne doit pas reposer la question.
  it("répond oui sur « Quitter », et la sortie qui suit passe", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    const answer = confirmLeave();
    await user.click(await screen.findByRole("button", { name: LEAVE }));

    await expect(answer).resolves.toBe(true);
    go(router, "/other");
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * F5 et fermeture d'onglet : seul l'historique du NAVIGATEUR écoute `beforeunload` — celui en
 * mémoire de `renderInRoute` l'ignore. Le routeur est donc monté ici sur `window.history`.
 */
describe("useLeaveGuard — rechargement et fermeture", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/edit");
  });

  async function mountInBrowser() {
    const rootRoute = createRootRoute();
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        createRoute({ getParentRoute: () => rootRoute, path: "/edit", component: Editor }),
      ]),
      history: createBrowserHistory(),
    });
    await router.load();
    return renderWithProviders(<RouterProvider router={router} />);
  }

  function unload(): Event {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  it("laisse recharger un écran sans saisie", async () => {
    await mountInBrowser();
    await screen.findByRole("button", { name: "edit" });

    expect(unload().defaultPrevented).toBe(false);
  });

  it("fait demander le navigateur sur une saisie non enregistrée", async () => {
    const { user } = await mountInBrowser();
    await user.click(await screen.findByRole("button", { name: "edit" }));

    expect(unload().defaultPrevented).toBe(true);
  });

  it("ne retient plus une saisie libérée", async () => {
    const { user } = await mountInBrowser();
    await user.click(await screen.findByRole("button", { name: "edit" }));
    await user.click(screen.getByRole("button", { name: "saved" }));

    expect(unload().defaultPrevented).toBe(false);
  });
});
