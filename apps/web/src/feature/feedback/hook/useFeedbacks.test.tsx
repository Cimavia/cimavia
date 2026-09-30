import { coachFeedbackKeys } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachFeedbackApi } from "@/feature/feedback/api";
import { renderWithQueryClient } from "../../../../test/query";
import { useFeedbacks, useMarkFeedbackRead } from "./useFeedbacks";

const { toastMock } = vi.hoisted(() => ({ toastMock: { onSuccess: vi.fn(), onError: vi.fn() } }));

vi.mock("@/feature/feedback/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/feature/feedback/api")>();
  return {
    ...actual,
    coachFeedbackApi: { ...actual.coachFeedbackApi, list: vi.fn(), markRead: vi.fn() },
  };
});
vi.mock("@/shared/hook/useMutationToast", () => ({ useMutationToast: () => toastMock }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(coachFeedbackApi.list).mockResolvedValue([]);
  vi.mocked(coachFeedbackApi.markRead).mockResolvedValue(undefined as never);
});

function pollingOf(poll?: boolean) {
  const { wrapper, queryClient } = renderWithQueryClient();
  const { result } = renderHook(() => useFeedbacks(poll === undefined ? undefined : { poll }), {
    wrapper,
  });
  return {
    result,
    options: () =>
      queryClient.getQueryCache().find({ queryKey: coachFeedbackKeys.list() })?.options,
  };
}

describe("useFeedbacks", () => {
  // L'écran des débriefs attend un retour en direct : il sonde par défaut.
  it("sonde la liste par défaut", async () => {
    const { result, options } = pollingOf();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(options()).toMatchObject({ refetchInterval: 30_000 });
  });

  // Le tableau de bord n'en tire qu'un compteur : pas de requête toutes les 30 s pour lui.
  it("ne sonde pas quand l'appelant n'en veut qu'un compteur", async () => {
    const { result, options } = pollingOf(false);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(options()).toMatchObject({ refetchInterval: false });
  });
});

describe("useMarkFeedbackRead", () => {
  function setup() {
    const { wrapper, queryClient } = renderWithQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useMarkFeedbackRead(), { wrapper });
    return { result, invalidate };
  }

  // Lu ici, le compteur du tableau de bord et la liste le sont aussi : toute la racine est périmée.
  it("marque lu, puis périme tous les débriefs", async () => {
    const { result, invalidate } = setup();

    act(() => result.current.mutate("f-1"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(coachFeedbackApi.markRead).toHaveBeenCalledWith("f-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: coachFeedbackKeys.all });
    expect(toastMock.onError).not.toHaveBeenCalled();
  });

  it("dit l'échec, sans rien périmer", async () => {
    const failure = new Error("réseau");
    vi.mocked(coachFeedbackApi.markRead).mockRejectedValue(failure);
    const { result, invalidate } = setup();

    act(() => result.current.mutate("f-1"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastMock.onError.mock.lastCall?.[0]).toBe(failure);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
