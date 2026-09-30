import { myPlanKeys } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { athletePlanApi } from "@/feature/plan/api";
import { useMyPlans, useScheduledSession } from "@/feature/plan/hook/useMyPlan";

// Seuls les appels sont remplacés : `myPlanKeys` reste le VRAI. Ce sont ces clés que le cache
// persiste sur le disque pour la lecture hors-ligne — une clé inventée ici ne prouverait rien.
vi.mock("@/feature/plan/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/feature/plan/api")>();
  return { ...original, athletePlanApi: { visible: vi.fn(), session: vi.fn() } };
});

let queryClient: QueryClient;

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

describe("useMyPlans", () => {
  it("lit les cycles visibles sous leur clé persistée", async () => {
    vi.mocked(athletePlanApi.visible).mockResolvedValue([]);

    const { result } = renderHook(() => useMyPlans(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(queryClient.getQueryData(myPlanKeys.visible())).toEqual([]);
  });
});

describe("useScheduledSession", () => {
  it("lit la séance demandée sous sa propre clé", async () => {
    const session = { id: "s-1" } as never;
    vi.mocked(athletePlanApi.session).mockResolvedValue(session);

    const { result } = renderHook(() => useScheduledSession("s-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(athletePlanApi.session).toHaveBeenCalledWith("s-1");
    expect(queryClient.getQueryData(myPlanKeys.session("s-1"))).toBe(session);
  });
});
