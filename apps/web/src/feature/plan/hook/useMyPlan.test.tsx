import type { PlanDto, ScheduledSessionDto } from "@cmv/shared";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { useMyPlans, useMyScheduledSession } from "./useMyPlan";

const api = vi.hoisted(() => ({ visible: vi.fn(), session: vi.fn() }));

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  athletePlanApi: api,
}));

describe("useMyPlans", () => {
  // Au pluriel depuis #172 : les cycles diffusés coexistent, aucun ne remplace l'autre.
  it("rend tous les cycles diffusés de l'athlète", async () => {
    const plans = [{ id: "p-1" }, { id: "p-2" }] as PlanDto[];
    api.visible.mockResolvedValue(plans);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useMyPlans(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(plans));
  });
});

describe("useMyScheduledSession", () => {
  it("charge le détail de la séance demandée", async () => {
    const session = { id: "s-1" } as ScheduledSessionDto;
    api.session.mockResolvedValue(session);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useMyScheduledSession("s-1"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(session));
    expect(api.session).toHaveBeenCalledWith("s-1");
  });
});
