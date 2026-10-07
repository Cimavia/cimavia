import type { CoachAthleteDto, PendingInvitationDto } from "@cmv/shared";
import { ApiError } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyCoachesScreen } from "@/feature/coach/screen/MyCoachesScreen";
import { renderInRoute } from "../../../../test/render";

vi.mock("@/feature/coach/api", async () => {
  const shared = await import("@cmv/shared");
  return {
    accountApi: {
      myCoaches: vi.fn(),
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
const myCoaches = vi.mocked(accountApi.myCoaches);
const myInvitations = vi.mocked(accountApi.myInvitations);
const acceptInvitation = vi.mocked(accountApi.acceptInvitation);
const declineInvitation = vi.mocked(accountApi.declineInvitation);

const INVITATION = {
  id: "inv_1",
  issuer: { kind: "coach" as const, name: "Marc Keller" },
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
  organizationName: null,
  isSelf: false,
} satisfies CoachAthleteDto;

const MARC = { ...RELATION, id: "rel_2", coachId: "u_marc", coachName: "Marc Keller" };

const render = () =>
  renderInRoute(<MyCoachesScreen />, { path: "/my-coach", links: ["/messages"] });

/**
 * Attend que les DEUX requêtes de l'écran soient posées avant de cliquer quoi que ce soit.
 *
 * `findByRole` sur le bouton résout dès que `myInvitations` a répondu — mais `myCoaches` répond
 * ensuite et **re-rend l'écran**, détachant le nœud qu'on vient d'obtenir. Le clic atterrit alors
 * sur un élément qui n'est plus dans le document, la mutation ne part pas, et le `waitFor` qui
 * suit expire. Le test tombait ainsi environ une fois sur trois, d'autant plus souvent que la
 * machine était chargée — un rouge sans régression, le pire des rouges.
 *
 * `coach.missing.title` vient de la branche « aucun coach », le bouton de `myInvitations` : les
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
  myCoaches.mockResolvedValue([]);
  myInvitations.mockResolvedValue([]);
  acceptInvitation.mockResolvedValue([RELATION]);
  declineInvitation.mockResolvedValue(undefined);
});

describe("MyCoachesScreen — l'invitation qui m'attend (#146)", () => {
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

  /**
   * Le cœur de #599 : un athlète déjà suivi accepte une seconde invitation. Jusque-là la carte
   * restait affichée mais « Rejoindre » était éteint — au plus un coach.
   */
  it("laisse un athlète déjà suivi rejoindre un second coach", async () => {
    myCoaches.mockResolvedValue([RELATION]);
    myInvitations.mockResolvedValue([INVITATION]);
    const { user } = await render();

    await screen.findByText("Julie Renaud");
    await user.click(await screen.findByRole("button", { name: "coach.invitation.join" }));

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("inv_1"));
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

describe("MyCoachesScreen — les états", () => {
  it("dit qu'il charge", async () => {
    myCoaches.mockReturnValue(new Promise(() => {}));
    await render();

    expect(screen.getByText("common.loading")).toBeInTheDocument();
    expect(screen.queryByText("coach.missing.title")).toBeNull();
  });

  // Panne et « pas de coach » ne se confondent pas : dire « aucun coach » sur une API injoignable
  // inquiéterait un athlète qui en a déjà.
  it("dit la panne sans dire « aucun coach », puis relit au réessai", async () => {
    myCoaches.mockRejectedValueOnce(new Error("réseau"));
    const { user } = await render();

    await user.click(await screen.findByRole("button", { name: "common.retry" }));

    expect(await screen.findByText("coach.missing.title")).toBeInTheDocument();
    expect(myCoaches).toHaveBeenCalledTimes(2);
  });
});

describe("MyCoachesScreen — ses coachs (#599)", () => {
  it("rend une ligne par coach, chacune ouvrant SON fil à titre d'athlète", async () => {
    myCoaches.mockResolvedValue([RELATION, MARC]);
    await render();

    expect(await screen.findByText("Julie Renaud")).toBeInTheDocument();
    expect(screen.getByText("Marc Keller")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "coach.linked.messageTo" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/messages?coach=u_coach&as=athlete",
      "/messages?coach=u_marc&as=athlete",
    ]);
    expect(screen.queryByText("coach.missing.title")).toBeNull();
  });

  // Une relation posée sans acceptation n'a pas de date : on le dit, on n'en invente pas.
  it("rend « — » quand on ignore depuis quand", async () => {
    myCoaches.mockResolvedValue([{ ...RELATION, joinedAt: null }]);
    await render();

    expect(await screen.findByText("—")).toBeInTheDocument();
  });

  // Être suivi n'empêche plus d'en rejoindre un autre : l'adresse reste utile.
  it("dit à quelle adresse un autre coach peut l'inviter", async () => {
    myCoaches.mockResolvedValue([RELATION]);
    await render();

    expect(await screen.findByText("coach.more.description")).toBeInTheDocument();
    expect(screen.getByText("lea@exemple.fr")).toBeInTheDocument();
  });
});

describe("MyCoachesScreen — aucun coach (#390)", () => {
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
