import type { PendingInvitationDto } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { router } from "expo-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JoinCoachScreen } from "@/feature/coach/screen/JoinCoachScreen";
import { ApiError } from "@/shared/lib/api";
import { pressButton, renderRn } from "../../../test/render";

vi.mock("@/feature/coach/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/coach/api")>();
  return {
    ...original,
    accountApi: {
      myCoach: vi.fn(),
      myInvitations: vi.fn(),
      acceptInvitation: vi.fn(),
      declineInvitation: vi.fn(),
    },
  };
});

vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));

const session = vi.hoisted(() => ({
  current: { user: { id: "ath_1", email: "lea@exemple.fr" } } as unknown,
}));
vi.mock("@/shared/lib/auth", () => ({
  authClient: { useSession: () => ({ data: session.current }) },
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

beforeEach(() => {
  session.current = { user: { id: "ath_1", email: "lea@exemple.fr" } };
  myCoach.mockResolvedValue(null);
  myInvitations.mockResolvedValue([]);
  acceptInvitation.mockResolvedValue(RELATION);
  declineInvitation.mockResolvedValue(undefined);
});

describe("JoinCoachScreen — l'invitation qui m'attend (#146)", () => {
  // Plus de code à saisir (#390) : la carte est le seul chemin pour rejoindre.
  it("annonce l'invitation, sans plus rien proposer à saisir", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<JoinCoachScreen />);

    expect(await screen.findByText("coach.invitation.title")).toBeTruthy();
    expect(container.querySelector("input")).toBeNull();
  });

  it("rejoint depuis la carte, sans rien faire recopier", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<JoinCoachScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.join");

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith("inv_1"));
  });

  /**
   * Le refus est armé en deux temps, comme une suppression : il est SANS RETOUR, le coach devra
   * réémettre. Un seul appui ne doit rien envoyer — c'est toute la valeur du geste.
   */
  it("n'envoie le refus qu'après confirmation", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<JoinCoachScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.decline");
    expect(declineInvitation).not.toHaveBeenCalled();

    pressButton(container, "coach.invitation.declineConfirm");
    await waitFor(() => expect(declineInvitation).toHaveBeenCalledWith("inv_1"));
  });

  /**
   * Le cœur de l'arbitrage, et la parité avec le web : un athlète DÉJÀ LIÉ voit quand même
   * l'invitation. La masquer laisserait un coach persuadé d'avoir invité quelqu'un qui ne verra
   * jamais rien — et refuser est justement le geste utile ici.
   */
  it("montre l'invitation à un athlète déjà lié, avec la raison de ne pas pouvoir l'accepter", async () => {
    myCoach.mockResolvedValue(RELATION);
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<JoinCoachScreen />);

    expect(await screen.findByText("coach.invitation.title")).toBeTruthy();
    expect(screen.getByText("coach.invitation.blocked")).toBeTruthy();
    // L'adresse où l'inviter, elle, n'a rien à faire ici : l'athlète est lié.
    expect(screen.queryByText("coach.join.address")).toBeNull();

    /**
     * « Rejoindre » est fermé, « Refuser » reste ouvert. L'armement du second sert ici de POINT
     * D'ARRÊT : il prouve que les deux appuis ont bien été traités, et rend donc l'absence d'appel
     * à l'acceptation observable plutôt que simplement pas-encore-arrivée.
     */
    pressButton(container, "coach.invitation.join");
    pressButton(container, "coach.invitation.decline");
    await waitFor(() => expect(screen.getByText("coach.invitation.declineConfirm")).toBeTruthy());
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  /**
   * `null` n'est pas la liste vide, et aucun des deux ne s'annonce. Ce qu'on ne fait JAMAIS, c'est
   * écrire « aucune invitation » sur une API injoignable — sans bloquer l'écran pour autant.
   */
  it.each<[string, () => Promise<PendingInvitationDto[]>]>([
    ["une liste vide", () => Promise.resolve([])],
    ["une requête en échec", () => Promise.reject(new Error("réseau"))],
  ])("n'annonce rien sur %s, et dit seulement l'absence de coach", async (_case, response) => {
    myInvitations.mockImplementation(response);
    renderRn(<JoinCoachScreen />);

    expect(await screen.findByText("coach.join.title")).toBeTruthy();
    expect(screen.queryByText("coach.invitation.decline")).toBeNull();
  });
});

describe("JoinCoachScreen — l'invitation, pendant et après", () => {
  it("dit l'acceptation en cours", async () => {
    acceptInvitation.mockReturnValue(new Promise(() => undefined));
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<JoinCoachScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.join");

    expect(await screen.findByText("coach.invitation.joining")).toBeTruthy();
  });

  /**
   * « Rejoindre » échouait en silence (#365) : seul le formulaire de code disait son erreur, de sa
   * propre mutation. Le message de l'API d'abord, le libellé quand il n'y en a pas.
   */
  it.each([
    [
      "tel que l'API l'a formulé",
      new ApiError(400, "Invitation expirée", null),
      "Invitation expirée",
    ],
    [
      "par le message générique sans formulation",
      new Error("réseau"),
      "coach.invitation.joinError",
    ],
  ])("dit l'échec de l'acceptation %s", async (_, failure, message) => {
    acceptInvitation.mockRejectedValue(failure);
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<JoinCoachScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.join");

    expect(await screen.findByText(message)).toBeTruthy();
    // Une seule fois : le formulaire de code a sa propre mutation, il ne la répète pas.
    expect(screen.queryByText("coach.join.error")).toBeNull();
  });

  /** Le mobile n'a pas de toasts : l'échec du refus se dit sur la carte. */
  it.each([
    [
      "tel que l'API l'a formulé",
      new ApiError(409, "Invitation déjà traitée", null),
      "Invitation déjà traitée",
    ],
    [
      "par le message générique sans formulation",
      new Error("réseau"),
      "coach.invitation.declineError",
    ],
  ])("dit l'échec du refus %s", async (_, failure, message) => {
    declineInvitation.mockRejectedValue(failure);
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<JoinCoachScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.decline");
    pressButton(container, "coach.invitation.declineConfirm");

    expect(await screen.findByText(message)).toBeTruthy();
  });
});

describe("JoinCoachScreen — sans coach, puis lié", () => {
  /**
   * Sans code à saisir (#390), une invitation partie vers une autre adresse ne s'afficherait
   * jamais, et rien ne dirait pourquoi. L'adresse du compte est le seul recours : c'est elle que
   * l'athlète donne à son coach.
   */
  it("dit l'adresse à laquelle le coach doit inviter, sans rien proposer à saisir", async () => {
    const { container } = renderRn(<JoinCoachScreen />);

    expect(await screen.findByText("coach.join.address")).toBeTruthy();
    expect(screen.getByText("lea@exemple.fr")).toBeTruthy();
    expect(container.querySelector("input")).toBeNull();
  });

  // Session pas encore lue : « — » plutôt qu'un blanc (règle dure n°5).
  it("rend « — » tant que l'adresse n'est pas connue", async () => {
    session.current = null;
    renderRn(<JoinCoachScreen />);

    expect(await screen.findByText("—")).toBeTruthy();
  });

  /** Lié, l'athlète n'a plus rien à saisir : l'écran l'envoie vers ses séances. */
  it("mène un athlète lié à sa planification", async () => {
    myCoach.mockResolvedValue(RELATION);
    const { container } = renderRn(<JoinCoachScreen />);
    await screen.findByText("coach.joined.title");

    pressButton(container, "coach.joined.goToPlanning");

    expect(router.replace).toHaveBeenCalledWith("/planning");
  });
});
