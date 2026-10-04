import { describe, expect, it, vi } from "vitest";
import type { CoachAthleteDto } from "../dto/coach-athlete.schema";
import { coachKeys } from "./account.api";
import { acceptInvitationMutation } from "./account.cache";

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

function setup() {
  const cache = { setQueryData: vi.fn(), invalidateQueries: vi.fn() };
  const api = { acceptInvitation: vi.fn().mockResolvedValue(RELATION) };
  return { cache, api, mutation: acceptInvitationMutation(cache, api) };
}

describe("acceptInvitationMutation", () => {
  it("transmet le code tel quel", async () => {
    const { api, mutation } = setup();

    await expect(mutation.mutationFn({ code: "7QK4M2XZ9" })).resolves.toBe(RELATION);
    expect(api.acceptInvitation).toHaveBeenCalledWith({ code: "7QK4M2XZ9" });
  });

  it("pose le coach obtenu sans attendre de le relire", () => {
    const { cache, mutation } = setup();

    mutation.onSuccess(RELATION);

    expect(cache.setQueryData).toHaveBeenCalledWith(coachKeys.mine(), RELATION);
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
