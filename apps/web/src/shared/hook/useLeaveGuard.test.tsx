import {
  type AnyRouter,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CmvLeaveDialog } from "@/shared/component";
import { confirmLeave, saveBeforeLeaving, useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { renderInRoute, renderWithProviders } from "../../../test/render";

const SAVE = "common.leave.save";
const DISCARD = "common.leave.discard";
const CANCEL = "common.leave.cancel";

/**
 * L'enregistrement de l'écran, réglé test par test : réussi par défaut, refusé (`false`), ou tenu
 * en suspens pour observer le dialogue pendant l'envoi.
 */
const save = vi.fn<() => Promise<boolean>>();

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue(true);
});

/** Un enregistrement qui ne répond qu'à la demande du test. */
function pendingSave() {
  let finish: (saved: boolean) => void = () => undefined;
  save.mockReturnValue(
    new Promise<boolean>((resolve) => {
      finish = resolve;
    }),
  );
  return (saved: boolean) => act(() => finish(saved));
}

/** Un écran minimal : une saisie à salir, et un enregistrement qui libère la sortie. */
function Editor() {
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty, save);
  return (
    <>
      <button type="button" onClick={() => setDirty(true)}>
        edit
      </button>
      {/* L'écran relu après un enregistrement : plus rien en attente. */}
      <button type="button" onClick={() => setDirty(false)}>
        clean
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

  it("retient une saisie non enregistrée, et « Annuler » ne bouge pas", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/other");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: CANCEL }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/edit");
  });

  it("part sans enregistrer quand le coach renonce à sa saisie", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/other");
    await user.click(await screen.findByRole("button", { name: DISCARD }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(save).not.toHaveBeenCalled();
  });

  it("enregistre, puis part", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/other");
    await user.click(await screen.findByRole("button", { name: SAVE }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(save).toHaveBeenCalledOnce();
  });

  // L'écran dit lui-même pourquoi : la garde, elle, refuse la navigation et ferme la question.
  it("reste sur un enregistrement refusé, toujours gardé", async () => {
    save.mockResolvedValue(false);
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/other");
    await user.click(await screen.findByRole("button", { name: SAVE }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/edit");
    go(router, "/other");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  // Un « Annuler » pendant l'envoi laisserait partir un enregistrement que plus rien n'attend.
  it("ferme les trois sorties, Échap compris, le temps de l'enregistrement", async () => {
    const finish = pendingSave();
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/other");
    await user.click(await screen.findByRole("button", { name: SAVE }));

    expect(await screen.findByRole("button", { name: "common.saving" })).toBeDisabled();
    expect(screen.getByRole("button", { name: DISCARD })).toBeDisabled();
    expect(screen.getByRole("button", { name: CANCEL })).toBeDisabled();
    const dialog = screen.getByRole("dialog");
    act(() => {
      dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await finish(true);
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
  });

  // `showModal` focalise le premier bouton, et Entrée valide le bouton focalisé : ce doit être
  // celui qui garde le travail. Le focus lui-même vient du navigateur — jsdom ne le pose pas.
  it("met « Enregistrer » en premier, puis « Ne pas enregistrer », puis « Annuler »", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    go(router, "/other");
    const dialog = await screen.findByRole("dialog");

    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([SAVE, DISCARD, CANCEL]);
  });

  // Échap déclenche `cancel` : sans le rattraper, la fenêtre se fermerait et la navigation
  // resterait suspendue — ni partie, ni refusée.
  it("traite Échap comme « Annuler »", async () => {
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
 * d'abord. La réponse dit si l'on peut agir, et si la saisie est partie.
 */
describe("confirmLeave", () => {
  it("répond « partir » d'emblée sans écran gardé", async () => {
    await expect(confirmLeave()).resolves.toBe("leave");
  });

  it("répond « partir » d'emblée sur un écran sans saisie", async () => {
    await mount();

    await expect(confirmLeave()).resolves.toBe("leave");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("répond « rester » sur « Annuler », et l'écran reste gardé", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    const answer = confirmLeave();
    await user.click(await screen.findByRole("button", { name: CANCEL }));

    await expect(answer).resolves.toBe("stay");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    go(router, "/other");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  // La navigation qui suit la déconnexion ne doit pas reposer la question.
  it("répond « partir » sur « Ne pas enregistrer », et la sortie qui suit passe", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    const answer = confirmLeave();
    await user.click(await screen.findByRole("button", { name: DISCARD }));

    await expect(answer).resolves.toBe("leave");
    expect(save).not.toHaveBeenCalled();
    go(router, "/other");
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("enregistre dans le dialogue, puis répond « enregistrer » et laisse passer", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    const answer = confirmLeave();
    await user.click(await screen.findByRole("button", { name: SAVE }));

    await expect(answer).resolves.toBe("save");
    expect(save).toHaveBeenCalledOnce();
    go(router, "/other");
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
  });

  it("répond « rester » quand l'enregistrement est refusé", async () => {
    save.mockResolvedValue(false);
    const { user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    const answer = confirmLeave();
    await user.click(await screen.findByRole("button", { name: SAVE }));

    await expect(answer).resolves.toBe("stay");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  // La session perdue : rien ne s'écrit avant la reconnexion, qui enregistrera elle-même.
  it("sans `saveNow`, répond « enregistrer » sans rien envoyer, et garde l'écran", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    const answer = confirmLeave({ saveNow: false });
    await user.click(await screen.findByRole("button", { name: SAVE }));

    await expect(answer).resolves.toBe("save");
    expect(save).not.toHaveBeenCalled();
    go(router, "/other");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("saveBeforeLeaving", () => {
  it("n'a rien à enregistrer sans écran gardé", async () => {
    await expect(saveBeforeLeaving()).resolves.toBe(true);
  });

  it("n'enregistre pas un écran sans saisie", async () => {
    await mount();

    await expect(saveBeforeLeaving()).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("enregistre l'écran gardé, et lève sa garde", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    await act(async () => {
      await expect(saveBeforeLeaving()).resolves.toBe(true);
    });

    go(router, "/other");
    await waitFor(() => expect(router.state.location.pathname).toBe("/other"));
  });

  // La déconnexion qui suivait a échoué : le coach est resté, et ce qu'il saisit ensuite compte.
  it("garde de nouveau une saisie reprise après l'enregistrement", async () => {
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));
    await act(async () => {
      await saveBeforeLeaving();
    });
    await user.click(screen.getByRole("button", { name: "clean" }));

    await user.click(screen.getByRole("button", { name: "edit" }));
    go(router, "/other");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/edit");
  });

  it("garde l'écran gardé quand l'enregistrement est refusé", async () => {
    save.mockResolvedValue(false);
    const { router, user } = await mount();
    await user.click(screen.getByRole("button", { name: "edit" }));

    await act(async () => {
      await expect(saveBeforeLeaving()).resolves.toBe(false);
    });

    go(router, "/other");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
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
