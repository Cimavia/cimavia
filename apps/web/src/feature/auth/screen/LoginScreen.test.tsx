import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPlanClipboard,
  type PlanWeekClipboard,
  usePlanClipboard,
} from "@/feature/plan/hook/usePlanClipboard";
import { renderInRoute } from "../../../../test/render";
import { LoginScreen } from "./LoginScreen";

const { useSessionMock, signInMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signInMock: vi.fn(),
}));

// Better Auth est coupé : il porte le réseau et les cookies, deux choses que cet écran délègue.
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => useSessionMock(),
    signIn: { email: signInMock },
  },
}));

const EMAIL = "common.email";
const PASSWORD = "common.password";
const SUBMIT = "auth.login.submit";

/** Monte l'écran sur `/login`, avec la cible que la garde y aurait posée. */
function setup(redirect?: string) {
  return renderInRoute(<LoginScreen />, {
    path: "/login",
    search: redirect == null ? {} : { redirect },
    links: ["/", "/feedbacks", "/forgot-password", "/register"],
  });
}

type View = Awaited<ReturnType<typeof setup>>;

async function signIn(view: View) {
  await view.user.type(view.getByLabelText(EMAIL), "coach@example.test");
  await view.user.type(view.getByLabelText(PASSWORD), "motdepasse1");
  await view.user.click(view.getByRole("button", { name: SUBMIT }));
}

/** Arme le presse-papier comme le ferait un coach du compte précédent, dans le même onglet. */
function copyWeekOutsideComponent(entry: PlanWeekClipboard) {
  const { result, unmount } = renderHook(() => usePlanClipboard());
  act(() => result.current.copyWeek(entry));
  unmount();
}

beforeEach(() => {
  vi.clearAllMocks();
  clearPlanClipboard();
  useSessionMock.mockReturnValue({ data: null, isPending: false });
  signInMock.mockResolvedValue({ error: null });
});

describe("LoginScreen", () => {
  it("emmène à l'accueil sans cible", async () => {
    const view = await setup();

    await signIn(view);

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/"));
  });

  it("efface tout ce qui reste du compte précédent AVANT de naviguer", async () => {
    const view = await setup();
    // `gcTime` infini pour CETTE clé : le harnais collecte à 0 ms ce que rien n'observe, et une
    // donnée évanouie d'elle-même ferait passer l'assertion de purge sans rien prouver.
    view.queryClient.setQueryDefaults(["athletes"], { gcTime: Number.POSITIVE_INFINITY });
    view.queryClient.setQueryData(["athletes"], [{ id: "a-du-compte-precedent" }]);
    copyWeekOutsideComponent({
      planWeekId: "w-1",
      planId: "plan-1",
      planTitle: "Bloc force — Léa",
      weekNumber: 2,
    });
    // Ce que l'écran d'arrivée trouverait en montant : relevé à l'instant où la navigation part.
    const seenAtNavigation: { cache: unknown; clipboard: string | null }[] = [];
    view.router.subscribe("onBeforeNavigate", () => {
      seenAtNavigation.push({
        cache: view.queryClient.getQueryData(["athletes"]),
        clipboard: sessionStorage.getItem("cmv.planClipboard"),
      });
    });

    await signIn(view);

    // Le seul passage OBLIGÉ d'un changement de compte : une session perdue ramène ici sans
    // qu'aucune déconnexion soit passée. Purger APRÈS la navigation servirait à l'écran d'arrivée
    // les Athletes, débriefs et factures du précédent (#373), et son presse-papier (#341).
    await waitFor(() => expect(seenAtNavigation).not.toHaveLength(0));
    expect(seenAtNavigation[0]).toEqual({ cache: undefined, clipboard: null });
  });

  it("ramène à la page que la garde a dû quitter", async () => {
    const view = await setup("/feedbacks?feedback=f-1");

    await signIn(view);

    // Le débrief ouvert depuis une notification, avec son paramètre : c'est lui que le coach
    // voulait lire, pas l'accueil (#337).
    await waitFor(() => expect(view.router.state.location.pathname).toBe("/feedbacks"));
    expect(view.router.state.location.search).toEqual({ feedback: "f-1" });
  });

  it("ne laisse pas l'écran de connexion dans l'historique", async () => {
    const view = await setup("/feedbacks?feedback=f-1");

    await signIn(view);

    await waitFor(() => expect(view.router.state.location.pathname).toBe("/feedbacks"));
    // Sinon Retour ramène à la connexion, qui renvoie aussitôt plus loin : le bouton est mort.
    expect(view.router.history).toHaveLength(1);
  });

  it("refuse une cible hors de l'application", async () => {
    const view = await setup("//site-piege.example");

    await signIn(view);

    // Suivre la cible ferait de la page de connexion un tremplin vers un site tiers, avec un
    // utilisateur fraîchement authentifié — une redirection ouverte.
    await waitFor(() => expect(view.router.state.location.pathname).toBe("/"));
  });

  it("renvoie directement à la cible qui est déjà connecté", async () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "u-1" } }, isPending: false });
    const { router, queryByLabelText } = await setup("/feedbacks?feedback=f-1");

    // Reconnecté dans un autre onglet : celui-ci relit la session au retour et doit reprendre la
    // cible, pas atterrir sur l'accueil.
    await waitFor(() => expect(router.state.location.pathname).toBe("/feedbacks"));
    expect(queryByLabelText(EMAIL)).not.toBeInTheDocument();
  });

  it("reste sur l'écran quand les identifiants sont refusés", async () => {
    signInMock.mockResolvedValue({ error: { status: 401 } });
    const view = await setup("/feedbacks");

    await signIn(view);

    expect(await view.findByText("auth.errors.invalidCredentials")).toBeInTheDocument();
    expect(view.router.state.location.pathname).toBe("/login");
  });

  it("dit quelque chose même quand l'appel casse", async () => {
    signInMock.mockRejectedValue(new Error("réseau coupé"));
    const view = await setup();

    await signIn(view);

    expect(await view.findByText("auth.errors.generic")).toBeInTheDocument();
  });
});
