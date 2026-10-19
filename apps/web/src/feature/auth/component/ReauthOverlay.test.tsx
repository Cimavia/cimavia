import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPlanClipboard, usePlanClipboard } from "@/feature/plan/hook/usePlanClipboard";
import { CmvLeaveDialog } from "@/shared/component";
import { useLeaveGuard } from "@/shared/hook/useLeaveGuard";
import { renderInRoute } from "../../../../test/render";
import { ReauthOverlay } from "./ReauthOverlay";

const { signInMock, signOutMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  signOutMock: vi.fn(async () => undefined),
}));

vi.mock("@/shared/lib/auth", () => ({
  authClient: { signIn: { email: signInMock }, signOut: signOutMock },
}));

/** L'enregistrement de l'écran perdu : réussi, sauf quand un test le refuse. */
const saveLost = vi.fn<() => Promise<boolean>>();

const OWNER = { id: "u-1", email: "coach@example.test" };
const PASSWORD = "common.password";
const SUBMIT = "auth.reauth.submit";

/**
 * La fenêtre posée sur un écran profond, avec un presse-papier armé par le compte parti. C'est lui
 * qui témoigne de la purge : le cache du harnais (`gcTime: 0`) se vide seul faute d'observateur,
 * une assertion dessus passerait quoi que fasse la fenêtre.
 */
async function setup({ unsaved = false } = {}) {
  /** L'écran perdu, INERTE comme `CmvRoleGate` le rend — et sa saisie, gardée ou non (#327). */
  function Lost() {
    const guard = useLeaveGuard(unsaved, saveLost);
    return (
      <div inert>
        <CmvLeaveDialog {...guard.dialog} />
      </div>
    );
  }
  function Screen() {
    const { copyWeek } = usePlanClipboard();
    return (
      <>
        <Lost />
        <button
          type="button"
          onClick={() =>
            copyWeek({ planWeekId: "w-1", planId: "plan-1", planTitle: "Bloc", weekNumber: 1 })
          }
        >
          copier
        </button>
        <ReauthOverlay owner={OWNER} />
      </>
    );
  }
  const view = await renderInRoute(<Screen />, {
    path: "/library/exercises/new",
    links: ["/login", "/"],
  });
  await view.user.click(view.getByRole("button", { name: "copier" }));
  return view;
}

type View = Awaited<ReturnType<typeof setup>>;

async function reconnect(view: View) {
  await view.user.type(view.getByLabelText(PASSWORD), "motdepasse1");
  await view.user.click(view.getByRole("button", { name: SUBMIT }));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPlanClipboard();
  signInMock.mockResolvedValue({ data: { user: { id: OWNER.id } }, error: null });
  saveLost.mockResolvedValue(true);
});

describe("ReauthOverlay", () => {
  it("reconnecte sous le compte qui a ouvert l'écran, et lui seul", async () => {
    const view = await setup();

    await reconnect(view);

    // L'e-mail n'est pas saisi : c'est celui du compte parti. Un autre compte hériterait sinon
    // du brouillon et du cache du précédent.
    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith({ email: OWNER.email, password: "motdepasse1" }),
    );
  });

  it("reprend sur place quand c'est bien le même compte", async () => {
    const view = await setup();
    const invalidate = vi.spyOn(view.queryClient, "invalidateQueries");

    await reconnect(view);

    // Les lectures tombées en 401 pendant la perte sont relancées ; rien n'est purgé — le
    // presse-papier en témoigne —, on ne quitte pas l'écran : le coach clique « Enregistrer » là
    // où il en était.
    expect(await view.findByText("auth.reauth.restored")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalled();
    expect(sessionStorage.getItem("cmv.planClipboard")).not.toBeNull();
    expect(view.router.state.location.pathname).toBe("/library/exercises/new");
  });

  it("repart de zéro si la connexion aboutit sur un autre compte", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u-2" } }, error: null });
    const view = await setup();

    await reconnect(view);

    // L'e-mail a pu changer de propriétaire entre-temps : un autre identifiant ne reprend pas
    // l'écran, il passe par la purge comme à tout changement de compte.
    await waitFor(() => expect(view.router.state.location.pathname).toBe("/login"));
    expect(sessionStorage.getItem("cmv.planClipboard")).toBeNull();
  });

  it("purge tout avant de laisser changer de compte", async () => {
    const view = await setup();

    await view.user.click(view.getByRole("button", { name: "auth.reauth.switchAccount" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/login"));
    expect(sessionStorage.getItem("cmv.planClipboard")).toBeNull();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("dit que le mot de passe est refusé, sans quitter l'écran", async () => {
    signInMock.mockResolvedValue({ data: null, error: { status: 401 } });
    const view = await setup();

    await reconnect(view);

    expect(await view.findByText("auth.errors.invalidCredentials")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/library/exercises/new");
  });

  it("dit quelque chose même quand l'appel casse", async () => {
    signInMock.mockRejectedValue(new Error("réseau coupé"));
    const view = await setup();

    await reconnect(view);

    expect(await view.findByText("auth.errors.generic")).toBeInTheDocument();
  });
});

describe("ReauthOverlay — saisie non enregistrée (#327)", () => {
  const SWITCH = "auth.reauth.switchAccount";
  // La fenêtre de reconnexion est elle-même un dialogue : la question se désigne par son titre.
  const LEAVE_DIALOG = { name: "common.leave.title" };

  it("demande AVANT de purger, et « Annuler » ne touche à rien", async () => {
    const view = await setup({ unsaved: true });

    await view.user.click(view.getByRole("button", { name: SWITCH }));
    await view.user.click(await view.findByRole("button", { name: "common.leave.cancel" }));

    await waitFor(() => expect(view.queryByRole("dialog", LEAVE_DIALOG)).not.toBeInTheDocument());
    expect(view.router.state.location.pathname).toBe("/library/exercises/new");
    expect(sessionStorage.getItem("cmv.planClipboard")).not.toBeNull();
  });

  it("purge et part une fois la perte confirmée", async () => {
    const view = await setup({ unsaved: true });

    await view.user.click(view.getByRole("button", { name: SWITCH }));
    await view.user.click(await view.findByRole("button", { name: "common.leave.discard" }));

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/login"));
    expect(sessionStorage.getItem("cmv.planClipboard")).toBeNull();
    expect(saveLost).not.toHaveBeenCalled();
  });

  // L'écran perdu est inerte : un dialogue rendu sous lui le serait aussi, boutons compris.
  it("pose la question hors de l'écran inerte", async () => {
    const view = await setup({ unsaved: true });

    await view.user.click(view.getByRole("button", { name: SWITCH }));

    expect((await view.findByRole("dialog", LEAVE_DIALOG)).closest("[inert]")).toBeNull();
  });

  // Un autre compte a pris la session : garder l'écran montrerait le travail du premier au second.
  it("repart de zéro sans rien demander quand la connexion aboutit sur un autre compte", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u-2" } }, error: null });
    const view = await setup({ unsaved: true });

    await reconnect(view);

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/login"));
    expect(view.queryByRole("dialog", LEAVE_DIALOG)).not.toBeInTheDocument();
  });
});

/**
 * « Enregistrer » sur une session déjà tombée (#682) : écrire maintenant finirait en 401, ou dans
 * la bibliothèque du compte qui a pris le cookie. L'enregistrement attend la reconnexion.
 */
describe("ReauthOverlay — enregistrer avant de changer de compte (#682)", () => {
  const SWITCH = "auth.reauth.switchAccount";

  async function chooseSave() {
    const view = await setup({ unsaved: true });
    await view.user.click(view.getByRole("button", { name: SWITCH }));
    await view.user.click(await view.findByRole("button", { name: "common.leave.save" }));
    return view;
  }

  it("n'écrit rien sans session, et ramène au mot de passe", async () => {
    const view = await chooseSave();

    expect(await view.findByText("auth.reauth.saveFirst")).toBeInTheDocument();
    expect(view.getByLabelText(PASSWORD)).toHaveFocus();
    expect(saveLost).not.toHaveBeenCalled();
    expect(view.router.state.location.pathname).toBe("/library/exercises/new");
  });

  // La session est de nouveau valide : purger et partir ne suffirait plus, il faut la couper.
  it("enregistre une fois reconnecté au même compte, puis déconnecte et part", async () => {
    signOutMock.mockImplementationOnce(async () => {
      expect(saveLost).toHaveBeenCalledOnce();
      return undefined;
    });
    const view = await chooseSave();

    await reconnect(view);

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/login"));
    expect(signOutMock).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem("cmv.planClipboard")).toBeNull();
  });

  it("garde le coach sur son écran, reconnecté, quand l'enregistrement est refusé", async () => {
    saveLost.mockResolvedValue(false);
    const view = await chooseSave();

    await reconnect(view);

    expect(await view.findByText("auth.reauth.restored")).toBeInTheDocument();
    expect(saveLost).toHaveBeenCalledOnce();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(view.router.state.location.pathname).toBe("/library/exercises/new");
  });

  // L'écran du premier compte ne s'enregistre jamais sous l'identité du second.
  it("n'enregistre rien quand la connexion aboutit sur un autre compte", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u-2" } }, error: null });
    const view = await chooseSave();

    await reconnect(view);

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/login"));
    expect(saveLost).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
