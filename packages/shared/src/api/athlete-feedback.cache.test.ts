import { describe, expect, it, vi } from "vitest";
import type { SessionFeedbackDto } from "../dto/feedback.schema";
import type { ScheduledSessionDto } from "../dto/plan.schema";
import { myFeedbackKeys } from "./athlete-feedback.api";
import { type FeedbackCache, feedbackSaveMutation } from "./athlete-feedback.cache";
import { myPlanKeys } from "./athlete-plan.api";
import { ApiError } from "./client";
import { coachFeedbackKeys } from "./coach-feedback.api";

/**
 * Un cache factice, qui applique les mises à jour comme TanStack Query : une fonction reçoit
 * l'ancienne valeur, tout le reste la remplace. Il note aussi ce qu'on lui a demandé de relire.
 */
function fakeCache() {
  const data = new Map<string, unknown>();
  const invalidated: unknown[] = [];
  const cache: FeedbackCache = {
    setQueryData: (queryKey, updater) => {
      const key = JSON.stringify(queryKey);
      data.set(key, typeof updater === "function" ? updater(data.get(key)) : updater);
    },
    invalidateQueries: ({ queryKey }) => invalidated.push(queryKey),
  };
  const get = (queryKey: readonly unknown[]) => data.get(JSON.stringify(queryKey));
  const put = (queryKey: readonly unknown[], value: unknown) =>
    data.set(JSON.stringify(queryKey), value);
  return { cache, get, put, invalidated };
}

const FEEDBACK = { id: "f-1" } as SessionFeedbackDto;
const API = { upsert: vi.fn(() => Promise.resolve(FEEDBACK)) };
const SESSION = {
  id: "s-1",
  exercises: [{ id: "sx-1", tracking: { "b-1": { checked: [0, 1, 2] } } }],
} as unknown as ScheduledSessionDto;

describe("feedbackSaveMutation — au succès", () => {
  it("la séance en cache porte le suivi envoyé AVANT que onSaved soit appelé", () => {
    const { cache, get, put } = fakeCache();
    put(myPlanKeys.session("s-1"), SESSION);
    const sent = { "sx-1": { "b-1": { checked: [0, 1, 2, 3] } } };
    let seenAtSave: unknown;
    const onSaved = vi.fn(() => {
      seenAtSave = (get(myPlanKeys.session("s-1")) as ScheduledSessionDto).exercises[0]?.tracking;
    });

    feedbackSaveMutation(cache, API, "s-1", onSaved).onSuccess(FEEDBACK, {
      content: null,
      tracking: sent,
    });

    expect(seenAtSave).toEqual(sent["sx-1"]);
    // Ce qui est parti accompagne l'appel : l'écran n'efface que si le local n'a pas bougé (#499).
    expect(onSaved).toHaveBeenCalledWith(sent);
  });

  it("sans séance en cache, n'en invente pas une", () => {
    const { cache, get } = fakeCache();

    feedbackSaveMutation(cache, API, "s-1").onSuccess(FEEDBACK, { content: null, tracking: {} });

    expect(get(myPlanKeys.session("s-1"))).toBeUndefined();
  });

  it("un envoi sans suivi ne touche pas à la séance, et le dit à onSaved", () => {
    const { cache, get, put } = fakeCache();
    put(myPlanKeys.session("s-1"), SESSION);
    const onSaved = vi.fn();

    feedbackSaveMutation(cache, API, "s-1", onSaved).onSuccess(FEEDBACK, { content: "Bien tenu" });

    expect(get(myPlanKeys.session("s-1"))).toBe(SESSION);
    expect(onSaved).toHaveBeenCalledWith(undefined);
  });

  it("range le débrief, et relit la séance, le cycle et la liste coach", () => {
    const { cache, get, invalidated } = fakeCache();

    feedbackSaveMutation(cache, API, "s-1").onSuccess(FEEDBACK, { content: null });

    expect(get(myFeedbackKeys.detail("s-1"))).toBe(FEEDBACK);
    expect(invalidated).toEqual([
      myPlanKeys.session("s-1"),
      myPlanKeys.visible(),
      coachFeedbackKeys.all,
    ]);
  });
});

describe("feedbackSaveMutation — l'envoi", () => {
  it("écrit le débrief de la séance par l'api du client", async () => {
    const { cache } = fakeCache();

    const saved = await feedbackSaveMutation(cache, API, "s-1").mutationFn({ content: "Dur" });

    expect(API.upsert).toHaveBeenCalledWith("s-1", { content: "Dur" });
    expect(saved).toBe(FEEDBACK);
  });
});

describe("feedbackSaveMutation — en cas d'échec", () => {
  it("un refus (400) relit la séance, que le filtre de l'écran a pu lire périmée", () => {
    const { cache, invalidated } = fakeCache();

    feedbackSaveMutation(cache, API, "s-1").onError(new ApiError(400, "exercice absent", null));

    expect(invalidated).toEqual([myPlanKeys.session("s-1")]);
  });

  it("une autre panne ne relit rien : la séance n'y est pour rien", () => {
    const { cache, invalidated } = fakeCache();

    feedbackSaveMutation(cache, API, "s-1").onError(new ApiError(503, "indisponible", null));
    feedbackSaveMutation(cache, API, "s-1").onError(new Error("réseau"));

    expect(invalidated).toEqual([]);
  });
});
