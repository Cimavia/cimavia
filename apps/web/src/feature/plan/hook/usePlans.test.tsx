import { myPlanKeys } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoiceKeys } from "@/feature/invoice/api";
import { planKeys } from "@/feature/plan/api";
import { renderWithQueryClient } from "../../../../test/query";
import { clearPlanClipboard, usePlanClipboard } from "./usePlanClipboard";
import { useCreatePlan, useDeletePlan, usePlans, usePublishPlan } from "./usePlans";

const { deletePlanMock, createPlanMock, listPlansMock, publishPlanMock, toastMock } = vi.hoisted(
  () => ({
    deletePlanMock: vi.fn(),
    createPlanMock: vi.fn(),
    listPlansMock: vi.fn(),
    publishPlanMock: vi.fn(),
    toastMock: { onSuccess: vi.fn(), onError: vi.fn() },
  }),
);

vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  deletePlan: deletePlanMock,
  createPlan: createPlanMock,
  listPlans: listPlansMock,
  publishPlan: publishPlanMock,
}));

vi.mock("@/shared/hook/useMutationToast", () => ({ useMutationToast: () => toastMock }));

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

/** Des entrées de cache posées d'avance : c'est leur fraîcheur qui dit ce qu'une écriture a invalidé. */
function seeded() {
  const view = renderWithQueryClient();
  for (const key of [planKeys.list(), invoiceKeys.all, myPlanKeys.visible()]) {
    // Sans observateur, le `gcTime: 0` du client de test les ramasserait avant la lecture.
    view.queryClient.setQueryDefaults(key, { gcTime: Number.POSITIVE_INFINITY });
    view.queryClient.setQueryData(key, []);
  }
  const stale = (key: readonly unknown[]) => view.queryClient.getQueryState(key)?.isInvalidated;
  return { ...view, stale };
}

describe("usePlans", () => {
  it("lit la liste des cycles du coach", async () => {
    listPlansMock.mockResolvedValue([{ id: "plan-1" }]);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlans(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([{ id: "plan-1" }]));
  });
});

describe("useCreatePlan", () => {
  it("crée le cycle, rafraîchit la liste et nomme le cycle créé", async () => {
    createPlanMock.mockResolvedValue({ id: "plan-9", title: "Bloc force" });
    const { wrapper, stale } = seeded();
    const { result } = renderHook(() => useCreatePlan(), { wrapper });

    await act(() => result.current.mutateAsync({ title: "Bloc force" } as never));

    expect(createPlanMock).toHaveBeenCalledWith({ title: "Bloc force" });
    expect(stale(planKeys.list())).toBe(true);
    expect(toastMock.onSuccess).toHaveBeenCalledWith("plan.toast.created", { title: "Bloc force" });
  });

  it("dit l'échec sans rien invalider", async () => {
    const failure = new Error("500");
    createPlanMock.mockRejectedValue(failure);
    const { wrapper, stale } = seeded();
    const { result } = renderHook(() => useCreatePlan(), { wrapper });

    await act(() => result.current.mutateAsync({ title: "Bloc" } as never).catch(() => {}));

    expect(toastMock.onError.mock.lastCall?.[0]).toBe(failure);
    expect(stale(planKeys.list())).toBe(false);
  });
});

describe("usePublishPlan", () => {
  /**
   * La diffusion émet la facture ET rend le cycle lisible côté athlète — en auto-coaching, dans le
   * même cache (#14). Oublier l'une des trois racines laissait un écran vide jusqu'au rechargement.
   */
  it("rafraîchit les cycles, les factures et la vue athlète", async () => {
    publishPlanMock.mockResolvedValue({ id: "plan-1", title: "Bloc" });
    const { wrapper, stale } = seeded();
    const { result } = renderHook(() => usePublishPlan(), { wrapper });

    await act(() => result.current.mutateAsync("plan-1"));

    expect(publishPlanMock).toHaveBeenCalledWith("plan-1");
    expect(stale(planKeys.list())).toBe(true);
    expect(stale(invoiceKeys.all)).toBe(true);
    expect(stale(myPlanKeys.visible())).toBe(true);
    expect(toastMock.onSuccess).toHaveBeenCalledWith("plan.toast.published", { title: "Bloc" });
  });
});
