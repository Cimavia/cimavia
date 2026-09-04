import { myPlanKeys, type PlanDto } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { planKeys, scheduledSessionKeys } from "../api";
import { usePlan, usePlanMutations } from "./usePlan";

const {
  getPlanMock,
  addPlanWeekMock,
  copyPlanWeekMock,
  updatePlanMock,
  updatePlanWeekMock,
  deletePlanWeekMock,
  onSuccessMock,
  onErrorMock,
} = vi.hoisted(() => ({
  getPlanMock: vi.fn(),
  addPlanWeekMock: vi.fn(),
  copyPlanWeekMock: vi.fn(),
  updatePlanMock: vi.fn(),
  updatePlanWeekMock: vi.fn(),
  deletePlanWeekMock: vi.fn(),
  onSuccessMock: vi.fn(),
  onErrorMock: vi.fn(),
}));

// Les fabriques de clés restent les VRAIES : c'est sur elles que porte l'assertion d'invalidation.
vi.mock("@/feature/plan/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/plan/api")>()),
  getPlan: getPlanMock,
  addPlanWeek: addPlanWeekMock,
  copyPlanWeek: copyPlanWeekMock,
  updatePlan: updatePlanMock,
  updatePlanWeek: updatePlanWeekMock,
  deletePlanWeek: deletePlanWeekMock,
}));

// Le toast est coupé pour ne pas traîner i18next et le contexte d'affichage : ce qui est vérifié
// ici, c'est QUELLE clé le hook annonce, pas comment elle s'affiche.
vi.mock("@/shared/hook/useMutationToast", () => ({
  useMutationToast: () => ({ onSuccess: onSuccessMock, onError: onErrorMock }),
}));

const planWith = (weeks: { id: string; sessionCount: number }[]) =>
  ({
    id: "plan-1",
    weeks: weeks.map((week) => ({
      id: week.id,
      sessions: Array.from({ length: week.sessionCount }, (_, index) => ({ id: `s-${index}` })),
    })),
  }) as unknown as PlanDto;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePlan", () => {
  it("charge le cycle demandé", async () => {
    getPlanMock.mockResolvedValue(planWith([]));
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlan("plan-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getPlanMock).toHaveBeenCalledWith("plan-1");
  });
});

describe("usePlanMutations", () => {
  /**
   * Les TROIS racines, pas seulement `plans`. Oublier `scheduled-sessions` rouvrirait le panneau
   * sur la composition d'avant l'enregistrement ; oublier `my-plan` laisserait l'auto-coaching
   * (#14) lire un cycle périmé, puisque c'est le même cache.
   */
  it("invalide les trois racines de cache après une écriture", async () => {
    addPlanWeekMock.mockResolvedValue(planWith([]));
    const { wrapper, queryClient } = renderWithQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.addWeek.mutateAsync({} as never);
    });

    const roots = invalidate.mock.calls.map(([options]) => options?.queryKey);
    expect(roots).toEqual([planKeys.all, scheduledSessionKeys.all, myPlanKeys.all]);
  });

  it("confirme l'écriture par la clé de toast attendue", async () => {
    addPlanWeekMock.mockResolvedValue(planWith([]));
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.addWeek.mutateAsync({} as never);
    });

    expect(onSuccessMock).toHaveBeenCalledWith("plan.toast.weekAdded");
  });

  /**
   * Le collage REMPLACE le contenu de la cible (#4). Sans le décompte dans le toast, un collage
   * qui remplace quatre séances par deux passerait inaperçu.
   */
  it("annonce combien de séances ont atterri dans la semaine collée", async () => {
    copyPlanWeekMock.mockResolvedValue(planWith([{ id: "w-2", sessionCount: 2 }]));
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.pasteWeek.mutateAsync({
        targetWeekId: "w-2",
        sourcePlanWeekId: "w-1",
      });
    });

    expect(onSuccessMock).toHaveBeenCalledWith("plan.toast.weekPasted", { count: "2" });
  });

  /**
   * Repli quand la semaine cible manque de la réponse : on confirme SANS chiffre. Annoncer
   * « 0 séance » inventerait un résultat que l'API n'a pas dit — règle dure n°5.
   */
  it("confirme sans chiffre plutôt que d'annoncer un zéro inventé", async () => {
    copyPlanWeekMock.mockResolvedValue(planWith([{ id: "une-autre", sessionCount: 3 }]));
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.pasteWeek.mutateAsync({
        targetWeekId: "w-2",
        sourcePlanWeekId: "w-1",
      });
    });

    expect(onSuccessMock).toHaveBeenCalledWith("plan.toast.weekPastedPlain");
  });

  /**
   * Affecter un destinataire (#144). Le toast lit le nom dans la RÉPONSE et non dans ce qu'il a
   * envoyé : c'est l'API qui nomme l'athlète, le client n'en connaît que l'identifiant.
   */
  it("annonce le destinataire tel que l'API le nomme", async () => {
    updatePlanMock.mockResolvedValue({ ...planWith([]), athleteName: "Léa Moreau" });
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.assignAthlete.mutateAsync("ath_lea");
    });

    expect(updatePlanMock).toHaveBeenCalledWith("plan-1", { athleteId: "ath_lea" });
    expect(onSuccessMock).toHaveBeenCalledWith("plan.toast.athleteAssigned", {
      name: "Léa Moreau",
    });
  });

  /**
   * Détacher : un cycle sans destinataire n'a aucun nom à annoncer, d'où un message à part plutôt
   * qu'un message à trou. `null` part tel quel — une chaîne vide serait un identifiant invalide.
   */
  it("annonce un cycle détaché sans prétendre nommer personne", async () => {
    updatePlanMock.mockResolvedValue({ ...planWith([]), athleteName: null });
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.assignAthlete.mutateAsync(null);
    });

    expect(updatePlanMock).toHaveBeenCalledWith("plan-1", { athleteId: null });
    expect(onSuccessMock).toHaveBeenCalledWith("plan.toast.athleteCleared");
  });

  // Changer de destinataire déplace le cycle ENTIER d'une vue athlète à une autre : les trois
  // racines doivent tomber, comme pour n'importe quelle autre écriture du builder.
  it("invalide les trois racines après une affectation, pas seulement la liste des cycles", async () => {
    updatePlanMock.mockResolvedValue({ ...planWith([]), athleteName: "Léa Moreau" });
    const { wrapper, queryClient } = renderWithQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.assignAthlete.mutateAsync("ath_lea");
    });

    const roots = invalidate.mock.calls.map(([options]) => options?.queryKey);
    expect(roots).toEqual([planKeys.all, scheduledSessionKeys.all, myPlanKeys.all]);
  });

  it("enregistre la semaine modifiée et l'annonce", async () => {
    updatePlanWeekMock.mockResolvedValue(planWith([]));
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.updateWeek.mutateAsync({ weekId: "w-1", input: {} as never });
    });

    expect(updatePlanWeekMock).toHaveBeenCalledWith("w-1", {});
    expect(onSuccessMock).toHaveBeenCalledWith("plan.toast.weekUpdated");
  });

  // Retirer une semaine renumérote les suivantes côté API : le client se contente de recharger.
  it("supprime la semaine demandée et l'annonce", async () => {
    deletePlanWeekMock.mockResolvedValue(planWith([]));
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.removeWeek.mutateAsync("w-1");
    });

    expect(deletePlanWeekMock).toHaveBeenCalledWith("w-1");
    expect(onSuccessMock).toHaveBeenCalledWith("plan.toast.weekDeleted");
  });

  it("remonte l'échec au toast d'erreur au lieu de le laisser dans la mutation", async () => {
    const failure = new Error("409");
    addPlanWeekMock.mockRejectedValue(failure);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    await act(async () => {
      await result.current.addWeek.mutateAsync({} as never).catch(() => {});
    });

    // TanStack passe aussi variables, contexte et méta : seul le premier argument nous intéresse.
    expect(onErrorMock.mock.calls[0]?.[0]).toBe(failure);
    expect(onSuccessMock).not.toHaveBeenCalled();
  });

  // `isBusy` garde le builder : il doit répondre oui dès QU'UNE des sept écritures est en vol.
  it("signale l'occupation dès qu'une écriture est en cours, puis la relâche", async () => {
    let resolvePending: (plan: PlanDto) => void = () => {};
    addPlanWeekMock.mockReturnValue(
      new Promise<PlanDto>((resolve) => {
        resolvePending = resolve;
      }),
    );
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanMutations("plan-1"), { wrapper });
    expect(result.current.isBusy).toBe(false);

    act(() => {
      result.current.addWeek.mutate({} as never);
    });
    await waitFor(() => expect(result.current.isBusy).toBe(true));

    await act(async () => {
      resolvePending(planWith([]));
    });
    await waitFor(() => expect(result.current.isBusy).toBe(false));
  });
});
