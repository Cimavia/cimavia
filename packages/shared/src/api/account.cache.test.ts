import { describe, expect, it, vi } from "vitest";
import type { CoachAthleteDto } from "../dto/coach-athlete.schema";
import { coachKeys } from "./account.api";
import { acceptInvitationMutation, withJoinedCoaches } from "./account.cache";

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
} as CoachAthleteDto;

// Un coach déjà là, rejoint plus tôt (#599).
const OTHER = { ...RELATION, id: "rel_0", coachId: "u_other", coachName: "Marc Keller" };

// Un second coach de la même entreprise, obtenu par la même acceptation (#602).
const SIBLING = {
  ...RELATION,
  id: "rel_2",
  coachId: "u_sibling",
  coachName: "Claire Dumas",
  organizationName: "Fontainebleau Escalade",
};

function setup() {
  const cache = { setQueryData: vi.fn(), invalidateQueries: vi.fn() };
  const api = { acceptInvitation: vi.fn().mockResolvedValue([RELATION]) };
  return { cache, api, mutation: acceptInvitationMutation(cache, api) };
}

describe("acceptInvitationMutation", () => {
  it("désigne l'invitation par son id", async () => {
    const { api, mutation } = setup();

    await expect(mutation.mutationFn("inv_1")).resolves.toEqual([RELATION]);
    expect(api.acceptInvitation).toHaveBeenCalledWith("inv_1");
  });

  it("pose les coachs obtenus dans la liste sans attendre de la relire", () => {
    const { cache, mutation } = setup();

    mutation.onSuccess([RELATION]);

    const [key, updater] = cache.setQueryData.mock.lastCall ?? [];
    expect(key).toEqual(coachKeys.list());
    expect(updater([OTHER])).toEqual([RELATION, OTHER]);
  });

  /**
   * SANS filtre, et c'est le point (#308) : une liste de clés en oubliait une — celle des
   * contreparties, dont dépend la barre d'onglets du mobile.
   */
  it("périme tout le cache, sans énumérer de clés", () => {
    const { cache, mutation } = setup();

    mutation.onSuccess([RELATION]);

    expect(cache.invalidateQueries).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("withJoinedCoaches", () => {
  it("met le coach rejoint en tête, avant ceux déjà là", () => {
    expect(withJoinedCoaches([OTHER], [RELATION])).toEqual([RELATION, OTHER]);
  });

  // L'invitation d'une entreprise lie à tous ses Coachs d'un coup (#602).
  it("met tous les coachs d'une même acceptation en tête, dans leur ordre", () => {
    expect(withJoinedCoaches([OTHER], [RELATION, SIBLING])).toEqual([RELATION, SIBLING, OTHER]);
  });

  // Une ligne par coach : rejoindre deux fois le même ne le dédouble pas.
  it("remplace le coach s'il figurait déjà dans la liste", () => {
    const stale = { ...RELATION, id: "rel_old" };
    expect(withJoinedCoaches([stale, OTHER], [RELATION])).toEqual([RELATION, OTHER]);
  });

  // Une entreprise sans Coach : rien à poser, la liste reste celle qu'on avait.
  it("laisse la liste telle quelle quand aucun coach n'est obtenu", () => {
    expect(withJoinedCoaches([OTHER], [])).toEqual([OTHER]);
  });

  // Jamais lue : on n'invente pas une liste aux seuls coachs obtenus.
  it("laisse intacte une liste jamais lue", () => {
    expect(withJoinedCoaches(undefined, [RELATION])).toBeUndefined();
  });
});
