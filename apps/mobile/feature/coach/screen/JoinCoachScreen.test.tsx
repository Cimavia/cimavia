import type { PendingInvitationDto } from "@cmv/shared";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JoinCoachScreen } from "@/feature/coach/screen/JoinCoachScreen";
import { pressButton, renderRn } from "../../../test/render";

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

vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));

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

beforeEach(() => {
  myCoach.mockResolvedValue(null);
  myInvitations.mockResolvedValue([]);
  acceptInvitation.mockResolvedValue(RELATION);
  declineInvitation.mockResolvedValue(undefined);
});

describe("JoinCoachScreen — l'invitation qui m'attend (#146)", () => {
  it("annonce l'invitation au-dessus du formulaire de code, sans le remplacer", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    renderRn(<JoinCoachScreen />);

    expect(await screen.findByText("coach.invitation.title")).toBeTruthy();
    // Le formulaire reste : il est le chemin des invitations GÉNÉRIQUES, que la liste n'annonce
    // jamais. Le remplacer fermerait ce chemin à qui a reçu son code de la main à la main.
    expect(screen.getByText("coach.join.codeLabel")).toBeTruthy();
  });

  it("reprend le code de la liste pour rejoindre, sans rien faire recopier", async () => {
    myInvitations.mockResolvedValue([INVITATION]);
    const { container } = renderRn(<JoinCoachScreen />);
    await screen.findByText("coach.invitation.title");

    pressButton(container, "coach.invitation.join");

    await waitFor(() => expect(acceptInvitation).toHaveBeenCalledWith({ code: "7QK4M2XZ9" }));
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
    await waitFor(() => expect(declineInvitation).toHaveBeenCalledWith({ code: "7QK4M2XZ9" }));
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
    // Le formulaire de code, lui, a disparu : l'athlète est lié, il n'a rien à saisir.
    expect(screen.queryByText("coach.join.codeLabel")).toBeNull();

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
  ])("n'annonce rien sur %s, et laisse le formulaire de code", async (_case, response) => {
    myInvitations.mockImplementation(response);
    renderRn(<JoinCoachScreen />);

    expect(await screen.findByText("coach.join.codeLabel")).toBeTruthy();
    expect(screen.queryByText("coach.invitation.decline")).toBeNull();
  });
});
