import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { clearPlanClipboard, usePlanClipboard } from "./usePlanClipboard";
import { useDeletePlan } from "./usePlans";

const { deletePlanMock } = vi.hoisted(() => ({ deletePlanMock: vi.fn() }));

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  deletePlan: deletePlanMock,
}));

vi.mock("@/shared/hook/useMutationToast", () => ({
  useMutationToast: () => ({ onSuccess: vi.fn(), onError: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  clearPlanClipboard();
  deletePlanMock.mockResolvedValue(undefined);
});

describe("useDeletePlan", () => {
  it.each([
    ["plan-1", null],
    ["plan-2", "w-1"],
  ])("en supprimant %s, garde dans le presse-papier : %s", async (removed, kept) => {
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => ({ remove: useDeletePlan(), clip: usePlanClipboard() }), {
      wrapper,
    });
    act(() =>
      result.current.clip.copyWeek({
        planWeekId: "w-1",
        planId: "plan-1",
        planTitle: "Bloc",
        weekNumber: 1,
      }),
    );

    await act(async () => {
      await result.current.remove.mutateAsync(removed);
    });

    // Une semaine copiée dans un cycle supprimé ne se colle plus nulle part (#341) ; supprimer un
    // AUTRE cycle ne touche pas au presse-papier.
    expect(result.current.clip.clipboard?.planWeekId ?? null).toBe(kept);
  });
});
