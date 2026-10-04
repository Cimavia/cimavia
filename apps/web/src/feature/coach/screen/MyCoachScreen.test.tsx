import type { PendingInvitationDto } from "@cmv/shared";
import { ApiError } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyCoachScreen } from "@/feature/coach/screen/MyCoachScreen";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/coach/api", async () => {
  const shared = await import("@cmv/shared");
  return {
    accountApi: {
      myCoach: vi.fn(),
      myInvitations: vi.fn(),
      acceptInvitation: vi.fn(),
      declineInvitation: vi.fn(),
    },
    coachKeys: shared.coachKeys,
    invitationKeys: shared.invitationKeys,
  };
});

/**
 * `CmvAppShell` importe `authClient`, et `@/shared/lib/auth` CRÉE ce client au chargement du
 * module — même quand l'AppShell est remplacé juste en dessous, l'`importOriginal` évalue le
 * graphe entier. Le client réel arme alors un temporisateur de session (nanostores) qui survit à
 * la destruction du jsdom : quand il se déclenche, `window` n'existe plus et Vitest compte une
 * erreur NON GÉRÉE — la suite entière échoue avec 519 tests verts.
 *
 * C'est ce qui a rendu la CI rouge sans qu'aucun test ne tombe. Tous les autres écrans posent déjà
 * ce mock ; ces deux fichiers étaient les seuls à l'omettre.
 */
const session = vi.hoisted(() => ({
  current: { user: { id: "ath_1", email: "lea@exemple.fr" } } as unknown,
}));

vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: session.current }),
    signOut: () => Promise.resolve(),
  },
}));

// L'AppShell tire toute la navigation (capacités, cloche, interlocuteurs) : hors sujet ici.
vi.mock("@/shared/component", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/component")>()),
  CmvAppShell: ({ title, children }: Readonly<{ title: string; children?: unknown }>) => (
    <div>
      <h1>{title}</h1>
      {children as never}
    </div>
  ),
}));

const { accountApi } = await import("@/feature/coach/api");
const myCoach = vi.mocked(accountApi.myCoach);
const myInvitations = vi.mocked(accountApi.myInvitations);
const acceptInvitation = vi.mocked(accountApi.acceptInvitation);
const declineInvitation = vi.mocked(accountApi.declineInvitation);

const INVITATION = {
  id: "inv_1",
  coachName: "Marc Keller",
  expiresAt: "2026-09-12T09:00:00.000Z",
  createdAt: "2026-09-05T09:00:00.000Z",
};

const RELATION = {
  id: "rel_1",
  coachId: "u_coach",
  coachName: "Julie Renaud",
  athleteId: "u_athlete",
  athleteName: "Léa",
  status: "ACTIVE",
  invitedAt: "2026-03-12T09:00:00.000Z",
  joinedAt: "2026-03-12T09:00:00.000Z",
  isSelf: false,
} as Awaited<ReturnType<typeof accountApi.acceptInvitation>>;

const render = () => renderInRoute(<MyCoachScreen />, { path: "/my-coach", links: ["/messages"] });

/**
 * Attend que les DEUX requêtes de l'écran soient posées avant de cliquer quoi que ce soit.
 *
 * `findByRole` sur le bouton résout dès que `myInvitations` a répondu — mais `myCoach` répond
 * ensuite et **re-rend l'écran**, détachant le nœud qu'on vient d'obtenir. Le clic atterrit alors
 * sur un élément qui n'est plus dans le document, la mutation ne part pas, et le `waitFor` qui
 * suit expire. Le test tombait ainsi environ une fois sur trois, d'autant plus souvent que la
 * machine était chargée — un rouge sans régression, le pire des rouges.
 *
 * `coach.missing.title` vient de la branche `myCoach == null`, le bouton de `myInvitations` : les
 * exiger tous les deux, puis REQUÊTER le bouton à l'instant du clic, ferme la fenêtre de course.
 */
async function clickAfterSettled(user: Awaited<ReturnType<typeof render>>["user"], name: string) {
  await screen.findByText("coach.missing.title");
  await screen.findByRole("button", { name });
  await user.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  session.current = { user: { id: "ath_1", email: "lea@exemple.fr" } };
  myCoach.mockResolvedValue(null);
  myInvitations.mockResolvedValue([]);
  acceptInvitation.mockResolvedValue(RELATION);
  declineInvitation.mockResolvedValue(undefined);
});

describe("MyCoachScreen — l'invitation qui m'attend (#146)", () => {
  // Plus de code à saisir (#390) : la carte est le seul chemin pour rejoindre.
  it("annonce l'invitation, sans plus rien proposer à saisir", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    await render();

    expect(await screen.findByText("coach.invitation.title")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("rejoint depuis la carte, sans rien faire recopier", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { user } = await render();

    await clickAfterSettled(user, "coach.invitation.join");

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("inv_1"));
  });

  /**
   * Le refus est armé en deux temps, comme une suppression : il est SANS RETOUR, le coach devra
   * réémettre. Ce test vérifie qu'un seul clic ne suffit pas — c'est toute la valeur du geste.
   */
  it("n'envoie le refus qu'après confirmation", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { user } = await render();

    await clickAfterSettled(user, "coach.invitation.decline");
    expect(declineInvitation).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "coach.invitation.declineConfirm" }));
    await waitFor(() => expect(declineInvitation).toHaveBeenCalledWith("inv_1"));
  });

  /**
   * Le cœur de l'arbitrage : un athlète DÉJÀ LIÉ voit quand même l'invitation. La masquer
   * laisserait un coach persuadé d'avoir invité quelqu'un qui ne verra jamais rien — et refuser
   * est justement le geste utile ici, c'est lui qui vide la liste d'attente de l'inviteur.
   */
  // Pendant la connexion, ni second envoi ni refus croisé : les deux gestes s'éteignent.
  it("dit la connexion en cours depuis la carte, gestes éteints", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    acceptInvitation.mockReturnValue(new Promise(() => {}));
    const { user } = await render();

    await clickAfterSettled(user, "coach.invitation.join");

    expect(await screen.findByRole("button", { name: "coach.invitation.joining" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "coach.invitation.decline" })).toBeDisabled();
  });

  /**
   * « Rejoindre » échouait en silence (#365) : le bouton repassait à son libellé, et l'athlète
   * recliquait en boucle sur une invitation expirée ou déjà utilisée. Le message de l'API d'abord,
   * le libellé générique quand il n'y en a pas (panne réseau).
   */
  it.each([
    ["le message de l'api", new ApiError(400, "Invitation expirée", null), "Invitation expirée"],
    ["un libellé", new Error("réseau"), "common.error"],
  ])("dit l'échec de « Rejoindre » par %s", async (_how, failure, text) => {
    myInvitations.mockResolvedValue([INVITATION]);
    acceptInvitation.mockRejectedValue(failure);
    const { user } = await render();

    await clickAfterSettled(user, "coach.invitation.join");

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("montre l'invitation à un athlète déjà lié, refusable mais pas acceptable", async () => {
    myCoach.mockResolvedValue(RELATION);
    myInvitations.mockResolvedValue([INVITATION]);
    await render();

    expect(await screen.findByText("coach.invitation.title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "coach.invitation.join" })).toBeDisabled();
    // La raison est écrite : un bouton grisé sans explication laisse chercher ce qui cloche.
    expect(screen.getByText("coach.invitation.blocked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "coach.invitation.decline" })).toBeEnabled();
  });

  /**
   * `null` n'est pas la liste vide, et aucun des deux ne s'annonce. Ce qu'on ne fait JAMAIS, c'est
   * écrire « aucune invitation » sur une API injoignable — mais on ne bloque pas l'écran pour
   * autant : l'absence d'invitation est le cas ordinaire.
   */
  it.each<[string, () => Promise<PendingInvitationDto[]>]>([
    ["une liste vide", () => Promise.resolve([])],
    ["une requête en échec", () => Promise.reject(new Error("réseau"))],
  ])("n'annonce rien sur %s, et dit seulement l'absence de coach", async (_case, response) => {
    myInvitations.mockImplementation(response);
    await render();

    expect(await screen.findByText("coach.missing.title")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "coach.invitation.decline" }),
    ).not.toBeInTheDocument();
  });
});

describe("MyCoachScreen — les états", () => {
  it("dit qu'il charge", async () => {
    myCoach.mockReturnValue(new Promise(() => {}));
    await render();

    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByText("coach.missing.title")).toBeNull();
  });

  // Panne et « pas de coach » ne se confondent pas : dire « aucun coach » sur une API injoignable
  // inquiéterait un athlète qui en a déjà un.
  it("dit la panne sans dire « aucun coach », puis relit au réessai", async () => {
    myCoach.mockRejectedValueOnce(new Error("réseau"));
    const { user } = await render();

    await user.click(await screen.findByRole("button", { name: "common.retry" }));

    expect(await screen.findByText("coach.missing.title")).toBeInTheDocument();
    expect(myCoach).toHaveBeenCalledTimes(2);
  });
});

describe("MyCoachScreen — le coach lié", () => {
  it("nomme le coach, depuis quand, et ouvre le fil à titre d'athlète", async () => {
    myCoach.mockResolvedValue(RELATION);
    await render();

    expect(await screen.findByRole("heading", { name: "Julie Renaud" })).toBeInTheDocument();
    expect(screen.getByText("coach.linked.since")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "coach.linked.message" })).toHaveAttribute(
      "href",
      "/messages?as=athlete",
    );
    expect(screen.queryByText("coach.missing.title")).toBeNull();
  });

  // Une relation posée sans acceptation n'a pas de date : on le dit, on n'en invente pas.
  it("dit qu'on ignore depuis quand, sans date inventée", async () => {
    myCoach.mockResolvedValue({ ...RELATION, joinedAt: null });
    await render();

    expect(await screen.findByText("coach.linked.sinceUnknown")).toBeInTheDocument();
    expect(screen.queryByText("coach.linked.since")).toBeNull();
  });
});

describe("MyCoachScreen — aucun coach (#390)", () => {
  /**
   * Sans code à saisir, une invitation partie vers une autre adresse ne s'afficherait jamais, et
   * rien ne dirait pourquoi. L'adresse du compte est le seul recours : c'est elle que l'athlète
   * donne à son coach.
   */
  it("dit l'adresse à laquelle le coach doit inviter, sans rien proposer à saisir", async () => {
    await render();

    expect(await screen.findByText("coach.missing.address")).toBeInTheDocument();
    expect(screen.getByText("lea@exemple.fr")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // Session pas encore lue : « — » plutôt qu'un blanc (règle dure n°5).
  it("rend « — » tant que l'adresse n'est pas connue", async () => {
    session.current = null;
    await render();

    expect(await screen.findByText("—")).toBeInTheDocument();
  });
});
