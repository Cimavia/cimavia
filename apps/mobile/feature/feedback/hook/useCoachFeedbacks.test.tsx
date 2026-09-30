import { coachFeedbackKeys } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachFeedbackApi } from "@/feature/feedback/api";
import {
  useCoachFeedbackDetail,
  useMarkFeedbackRead,
} from "@/feature/feedback/hook/useCoachFeedbacks";

// Seuls les appels sont remplacés : `coachFeedbackKeys` reste le VRAI, sinon le test vérifierait
// une clé de cache qu'il a lui-même inventée.
vi.mock("@/feature/feedback/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/feedback/api")>();
  return {
    ...original,
    coachFeedbackApi: { ...original.coachFeedbackApi, getBySession: vi.fn(), markRead: vi.fn() },
  };
});

let queryClient: QueryClient;

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
});

describe("useCoachFeedbackDetail", () => {
  it("lit le débrief de la séance sous sa propre clé", async () => {
    const feedback = { id: "f-1", media: [], messages: [] } as never;
    vi.mocked(coachFeedbackApi.getBySession).mockResolvedValue(feedback);

    const { result } = renderHook(() => useCoachFeedbackDetail("s-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(coachFeedbackApi.getBySession).toHaveBeenCalledWith("s-1");
    expect(queryClient.getQueryData(coachFeedbackKeys.bySession("s-1"))).toEqual(feedback);
  });
});

describe("useMarkFeedbackRead", () => {
  /** La RACINE : la liste et la tuile « Débriefs à relire » du tableau de bord tombent ensemble. */
  it("marque le débrief lu, puis invalide toute la racine des débriefs", async () => {
    vi.mocked(coachFeedbackApi.markRead).mockResolvedValue(undefined as never);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useMarkFeedbackRead(), { wrapper });

    result.current.mutate("f-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(coachFeedbackApi.markRead).toHaveBeenCalledWith("f-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: coachFeedbackKeys.all });
  });
});
