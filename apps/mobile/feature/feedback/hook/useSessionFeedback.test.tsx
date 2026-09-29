import { myPlanKeys, type ScheduledSessionDto } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api";
import { useUpsertFeedback, withSentTracking } from "./useSessionFeedback";

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));

/**
 * L'API est coupée, pas les clés de cache : les inventer ici ferait vérifier au test une clé qu'il
 * aurait lui-même choisie.
 */
vi.mock("@/feature/feedback/api", async () => ({
  athleteFeedbackApi: { upsert: upsertMock },
  myFeedbackKeys: (await import("@cmv/shared")).myFeedbackKeys,
}));

vi.mock("@/feature/plan/api", async () => ({
  myPlanKeys: (await import("@cmv/shared")).myPlanKeys,
}));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onSaved = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useUpsertFeedback("s-1", onSaved), { wrapper });
  return { result, invalidate, onSaved, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useUpsertFeedback", () => {
  /**
   * Le filtre de l'écran lit la séance EN CACHE : si le coach vient d'en retirer un exercice, il
   * ne le sait pas, et le serveur refuse. Relire la séance est ce qui débloque l'envoi suivant.
   */
  it("un refus (400) relit la séance, et laisse le suivi local en place", async () => {
    upsertMock.mockRejectedValue(new ApiError(400, "exercice absent", null));
    const { result, invalidate, onSaved } = setup();

    act(() => result.current.mutate({ content: null, tracking: { "sx-retire": null } }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: myPlanKeys.session("s-1") });
    // Le suivi local n'est vidé qu'au succès : un refus ne coûte aucune coche.
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("une autre panne ne relit rien : la séance n'y est pour rien", async () => {
    upsertMock.mockRejectedValue(new ApiError(503, "indisponible", null));
    const { result, invalidate } = setup();

    act(() => result.current.mutate({ content: null }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("un succès vide le suivi local et relit la séance, désormais débriefée", async () => {
    upsertMock.mockResolvedValue({ id: "f-1" });
    const { result, invalidate, onSaved } = setup();

    act(() => result.current.mutate({ content: "Bien tenu" }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: myPlanKeys.session("s-1") });
  });
});

// Trois exercices : un suivi, un non suivi, un que l'envoi ne cite pas.
const SESSION = {
  id: "s-1",
  exercises: [
    { id: "sx-1", tracking: { "b-1": { checked: [0, 1, 2] } } },
    { id: "sx-2", tracking: { "b-1": { checked: [0] } } },
    { id: "sx-3", tracking: { "b-1": { rounds: 4 } } },
  ],
} as unknown as ScheduledSessionDto;

/**
 * Sitôt le local effacé, les écrans affichent la séance EN CACHE : si elle porte encore l'ancien
 * décompte, une coche posée avant la relecture le ressuscite en local (#346).
 */
describe("useUpsertFeedback — la séance en cache suit l'envoi", () => {
  it("le cache porte le suivi envoyé AVANT que le local soit effacé", async () => {
    upsertMock.mockResolvedValue({ id: "f-1" });
    const { result, onSaved, queryClient } = setup();
    queryClient.setQueryData(myPlanKeys.session("s-1"), SESSION);
    const sent = { "sx-1": { "b-1": { checked: [0, 1, 2, 3] } } };
    let seenAtClear: unknown;
    onSaved.mockImplementation(() => {
      seenAtClear = queryClient.getQueryData<ScheduledSessionDto>(myPlanKeys.session("s-1"))
        ?.exercises[0]?.tracking;
    });

    act(() => result.current.mutate({ content: null, tracking: sent }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(seenAtClear).toEqual(sent["sx-1"]);
  });

  it("sans séance en cache, n'en invente pas une", async () => {
    upsertMock.mockResolvedValue({ id: "f-1" });
    const { result, queryClient } = setup();

    act(() => result.current.mutate({ content: null, tracking: { "sx-1": null } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
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

describe("withSentTracking", () => {
  it("remplace ce que l'envoi cite, efface sur null, garde le reste", () => {
    const next = withSentTracking(SESSION, {
      "sx-1": { "b-1": { checked: [0, 1, 2, 3] } },
      "sx-2": null,
    });

    expect(next.exercises.map((exercise) => exercise.tracking)).toEqual([
      { "b-1": { checked: [0, 1, 2, 3] } },
      null,
      { "b-1": { rounds: 4 } },
    ]);
    // L'exercice non cité est rendu tel quel, pas recopié.
    expect(next.exercises[2]).toBe(SESSION.exercises[2]);
  });
});
