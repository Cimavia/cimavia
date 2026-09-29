import { myPlanKeys, type ScheduledSessionDto } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { useUpsertMyFeedback } from "./useMyFeedback";

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));

vi.mock("@/feature/feedback/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/feedback/api")>()),
  athleteFeedbackApi: { upsert: upsertMock },
}));

function setup() {
  const { queryClient, wrapper } = renderWithQueryClient();
  // Le harnais ramasse aussitôt une entrée sans lecteur (`gcTime: 0`) : la séance posée à la main
  // disparaîtrait avant la réponse de l'envoi, et le test vérifierait un cache vide.
  queryClient.setQueryDefaults(myPlanKeys.session("s-1"), { gcTime: Number.POSITIVE_INFINITY });
  const onSaved = vi.fn();
  const { result } = renderHook(() => useUpsertMyFeedback("s-1", onSaved), { wrapper });
  return { result, onSaved, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Deux exercices suivis : l'envoi corrige le premier, ne cite pas le second.
const SESSION = {
  id: "s-1",
  exercises: [
    { id: "sx-1", tracking: { "b-1": { checked: [0, 1, 2] } } },
    { id: "sx-2", tracking: { "b-1": { rounds: 4 } } },
  ],
} as unknown as ScheduledSessionDto;

/**
 * Sitôt le local effacé, l'écran affiche la séance EN CACHE : si elle porte encore l'ancien
 * décompte, une coche posée avant la relecture le ressuscite en local (#499).
 */
describe("useUpsertMyFeedback — la séance en cache suit l'envoi", () => {
  it("le cache porte le suivi envoyé AVANT que le local soit effacé", async () => {
    upsertMock.mockResolvedValue({ id: "f-1" });
    const { result, onSaved, queryClient } = setup();
    queryClient.setQueryData(myPlanKeys.session("s-1"), SESSION);
    const sent = { "sx-1": { "b-1": { checked: [0, 1, 2, 3] } } };
    let seenAtClear: unknown;
    onSaved.mockImplementation(() => {
      seenAtClear = queryClient
        .getQueryData<ScheduledSessionDto>(myPlanKeys.session("s-1"))
        ?.exercises.map((exercise) => exercise.tracking);
    });

    act(() => result.current.mutate({ content: null, tracking: sent }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenAtClear).toEqual([sent["sx-1"], { "b-1": { rounds: 4 } }]);
  });

  it("sans séance en cache, n'en invente pas une", async () => {
    upsertMock.mockResolvedValue({ id: "f-1" });
    const { result, onSaved, queryClient } = setup();

    act(() => result.current.mutate({ content: null, tracking: { "sx-1": null } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(myPlanKeys.session("s-1"))).toBeUndefined();
  });

  it("un envoi sans suivi ne touche pas au cache", async () => {
    upsertMock.mockResolvedValue({ id: "f-1" });
    const { result, queryClient } = setup();
    queryClient.setQueryData(myPlanKeys.session("s-1"), SESSION);

    act(() => result.current.mutate({ content: "Bien tenu" }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(myPlanKeys.session("s-1"))).toBe(SESSION);
  });
});
