import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPlanClipboard,
  type PlanWeekClipboard,
  usePlanClipboard,
} from "@/feature/plan/hook/usePlanClipboard";
import { renderInRoute } from "../../../../test/render";
import { RegisterScreen } from "./RegisterScreen";

const { useSessionMock, signUpMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  signUpMock: vi.fn(),
}));

// Better Auth est coupé : il porte le réseau et les cookies, deux choses que cet écran délègue.
// Ce qui est vérifié ici est ce qu'il LUI demande, et ce qu'il fait de sa réponse.
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => useSessionMock(),
    signUp: { email: signUpMock },
  },
}));

const NAME = "auth.register.name";
const EMAIL = "common.email";
const PASSWORD = "common.password";
const SUBMIT = "auth.register.submit";
const COACH = "auth.register.capabilityCoach";
const ATHLETE = "auth.register.capabilityAthlete";

function setup() {
  return renderInRoute(<RegisterScreen />, { path: "/register", links: ["/", "/login"] });
}

type View = Awaited<ReturnType<typeof setup>>;

/** Remplit l'identité et soumet — quand le sujet est ce qui SUIT une inscription réussie. */
async function submitRegistration(view: View) {
  await fillIdentity(view);
  await view.user.click(view.getByRole("button", { name: SUBMIT }));
}

/** Remplit l'identité, qui n'est jamais le sujet des assertions ci-dessous. */
async function fillIdentity(view: View) {
  await view.user.type(view.getByLabelText(NAME), "Kylian");
  await view.user.type(view.getByLabelText(EMAIL), "kylian@example.test");
  await view.user.type(view.getByLabelText(PASSWORD), "motdepasse1");
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
  signUpMock.mockResolvedValue({ error: null });
});

describe("RegisterScreen", () => {
  it("part avec la capacité athlète cochée", async () => {
    const { getByLabelText } = await setup();

    // Le cas le plus courant est préparé : un athlète invité par son coach n'a rien à cocher.
    expect(getByLabelText(ATHLETE)).toBeChecked();
    expect(getByLabelText(COACH)).not.toBeChecked();
  });

  it("laisse cumuler les deux capacités", async () => {
    const view = await setup();
    await fillIdentity(view);

    await view.user.click(view.getByLabelText(COACH));
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    // Elles sont CUMULABLES (#7) : un coach qui se coache lui-même coche les deux, et `role`
    // n'est plus envoyé — l'API le déduit.
    await waitFor(() =>
      expect(signUpMock).toHaveBeenCalledWith({
        email: "kylian@example.test",
        password: "motdepasse1",
        name: "Kylian",
        isCoach: true,
        isAthlete: true,
      }),
    );
  });

  it("refuse une inscription sans aucune capacité, sans appeler l'API", async () => {
    const view = await setup();
    await fillIdentity(view);

    await view.user.click(view.getByLabelText(ATHLETE));
    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    // Garde côté client EN PLUS de celle de l'API : un compte sans capacité se retrouverait
    // devant une application vide, et l'apprendre après un aller-retour serait pire.
    expect(await view.findByText("auth.errors.noCapability")).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
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

    await submitRegistration(view);

    // Le seul passage OBLIGÉ d'un changement de compte : une session perdue ramène ici sans
    // qu'aucune déconnexion soit passée. Purger APRÈS la navigation servirait à l'écran d'arrivée
    // les Athletes, débriefs et factures du précédent (#373), et son presse-papier (#341).
    await waitFor(() => expect(seenAtNavigation).not.toHaveLength(0));
    expect(seenAtNavigation[0]).toEqual({ cache: undefined, clipboard: null });
  });

  it("emmène à l'accueil une fois le compte créé", async () => {
    const view = await setup();
    await fillIdentity(view);

    await view.user.click(view.getByRole("button", { name: SUBMIT }));

    // Sans cette navigation, l'inscription réussie laisserait l'utilisateur sur le formulaire
    // qu'il vient de soumettre — indiscernable d'un échec silencieux.
    await waitFor(() => expect(view.router.state.location.pathname).toBe("/"));
  });

  describe("ce que dit l'échec", () => {
    /**
     * Le message n'est pas cosmétique. « Une erreur est survenue, réessaie » ferait recommencer
     * une saisie juste : sur un environnement fermé (403, #263) aucune tentative ne passera, et
     * une adresse déjà prise ne se corrige pas non plus en réessayant. 422 est le SEUL code que
     * Better Auth réserve à l'e-mail déjà utilisé au sign-up — les autres validations sont des
     * 400, qu'un message « e-mail déjà pris » ferait mentir.
     */
    it.each([
      [403, "auth.errors.signupClosed"],
      [422, "auth.errors.emailInUse"],
      [400, "auth.errors.generic"],
    ])("traduit le refus %s en %s", async (status, message) => {
      signUpMock.mockResolvedValue({ error: { status } });
      const view = await setup();
      await fillIdentity(view);

      await view.user.click(view.getByRole("button", { name: SUBMIT }));

      expect(await view.findByText(message)).toBeInTheDocument();
    });

    it("dit quelque chose même quand l'appel casse", async () => {
      signUpMock.mockRejectedValue(new Error("réseau coupé"));
      const view = await setup();
      await fillIdentity(view);

      await view.user.click(view.getByRole("button", { name: SUBMIT }));

      // Une panne réseau ne remonte pas d'`error.status` : sans ce `catch`, l'écran resterait
      // muet et l'utilisateur recliquerait indéfiniment.
      expect(await view.findByText("auth.errors.generic")).toBeInTheDocument();
    });
  });

  it("renvoie à l'accueil qui est déjà connecté", async () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "u-1" } }, isPending: false });
    const { router, queryByLabelText } = await setup();

    // La REDIRECTION est affirmée, pas seulement l'absence du formulaire : un DOM vide pour
    // n'importe quelle autre raison ferait passer une assertion d'absence sans rien vérifier.
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(queryByLabelText(EMAIL)).not.toBeInTheDocument();
  });

  it("montre le formulaire tant que la session n'est pas tranchée", async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true });
    const { getByLabelText } = await setup();

    // Rediriger pendant le chargement enverrait un visiteur non connecté vers l'accueil, d'où il
    // reviendrait aussitôt : la redirection attend une réponse, pas une absence de réponse.
    expect(getByLabelText(EMAIL)).toBeInTheDocument();
  });
});
