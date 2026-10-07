import { describe, expect, it, vi } from "vitest";
import type { CoachAthleteDto } from "../dto/coach-athlete.schema";
import { coachKeys } from "./account.api";
import { acceptInvitationMutation, withJoinedCoach } from "./account.cache";

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
} as CoachAthleteDto;

// Un coach déjà là, rejoint plus tôt (#599).
const OTHER = { ...RELATION, id: "rel_0", coachId: "u_other", coachName: "Marc Keller" };

function setup() {
  const cache = { setQueryData: vi.fn(), invalidateQueries: vi.fn() };
  const api = { acceptInvitation: vi.fn().mockResolvedValue(RELATION) };
  return { cache, api, mutation: acceptInvitationMutation(cache, api) };
}

describe("acceptInvitationMutation", () => {
  it("désigne l'invitation par son id", async () => {
    const { api, mutation } = setup();

    await expect(mutation.mutationFn("inv_1")).resolves.toBe(RELATION);
    expect(api.acceptInvitation).toHaveBeenCalledWith("inv_1");
  });

  it("pose le coach obtenu dans la liste sans attendre de la relire", () => {
    const { cache, mutation } = setup();

    mutation.onSuccess(RELATION);

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

    mutation.onSuccess(RELATION);

    expect(cache.invalidateQueries).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("withJoinedCoach", () => {
  it("met le coach rejoint en tête, avant ceux déjà là", () => {
    expect(withJoinedCoach([OTHER], RELATION)).toEqual([RELATION, OTHER]);
  });

  // Une ligne par coach : rejoindre deux fois le même ne le dédouble pas.
  it("remplace le coach s'il figurait déjà dans la liste", () => {
    const stale = { ...RELATION, id: "rel_old" };
    expect(withJoinedCoach([stale, OTHER], RELATION)).toEqual([RELATION, OTHER]);
  });

  // Jamais lue : on n'invente pas une liste d'un seul coach à qui en a peut-être d'autres.
  it("laisse intacte une liste jamais lue", () => {
    expect(withJoinedCoach(undefined, RELATION)).toBeUndefined();
  });
});
