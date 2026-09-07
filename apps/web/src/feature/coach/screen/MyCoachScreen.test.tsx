import type { PendingInvitationDto } from "@cmv/shared";
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
vi.mock("@/shared/lib/auth", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "ath_1" } } }),
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
  code: "7QK4M2XZ9",
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
 * `coach.join.codeLabel` vient de la branche `myCoach == null`, le bouton de `myInvitations` : les
 * exiger tous les deux, puis REQUÊTER le bouton à l'instant du clic, ferme la fenêtre de course.
 */
async function clickAfterSettled(user: Awaited<ReturnType<typeof render>>["user"], name: string) {
  await screen.findByLabelText("coach.join.codeLabel");
  await screen.findByRole("button", { name });
  await user.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  myCoach.mockResolvedValue(null);
  myInvitations.mockResolvedValue([]);
  acceptInvitation.mockResolvedValue(RELATION);
  declineInvitation.mockResolvedValue(undefined);
});

describe("MyCoachScreen — l'invitation qui m'attend (#146)", () => {
  it("annonce l'invitation au-dessus du formulaire de code, sans le remplacer", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    await render();

    expect(await screen.findByText("coach.invitation.title")).toBeInTheDocument();
    // Le formulaire reste : il est le chemin des invitations GÉNÉRIQUES, que la liste n'annonce
    // jamais. Le remplacer fermerait ce chemin à qui a reçu son code de la main à la main.
    expect(screen.getByLabelText("coach.join.codeLabel")).toBeInTheDocument();
  });

  it("reprend le code de la liste pour rejoindre, sans rien faire recopier", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { user } = await render();

    await clickAfterSettled(user, "coach.invitation.join");

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith({ code: "7QK4M2XZ9" }));
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
    await waitFor(() => expect(declineInvitation).toHaveBeenCalledWith({ code: "7QK4M2XZ9" }));
  });

  /**
   * Le cœur de l'arbitrage : un athlète DÉJÀ LIÉ voit quand même l'invitation. La masquer
   * laisserait un coach persuadé d'avoir invité quelqu'un qui ne verra jamais rien — et refuser
   * est justement le geste utile ici, c'est lui qui vide la liste d'attente de l'inviteur.
   */
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
   * autant : l'absence d'invitation est le cas ordinaire, et le formulaire de code reste le
   * chemin qui marche.
   */
  it.each<[string, () => Promise<PendingInvitationDto[]>]>([
    ["une liste vide", () => Promise.resolve([])],
    ["une requête en échec", () => Promise.reject(new Error("réseau"))],
  ])("n'annonce rien sur %s, et laisse le formulaire de code", async (_case, response) => {
    myInvitations.mockImplementation(response);
    await render();

    expect(await screen.findByLabelText("coach.join.codeLabel")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "coach.invitation.decline" }),
    ).not.toBeInTheDocument();
  });
});
