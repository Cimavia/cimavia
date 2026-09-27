import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { clearPlanClipboard, usePlanClipboard } from "@/feature/plan/hook/usePlanClipboard";
import { renderWithQueryClient } from "../../../test/query";
import { resetAccountData } from "./account-reset";

beforeEach(() => {
  clearPlanClipboard();
});

describe("resetAccountData", () => {
  it("efface le cache ET le presse-papier du compte quitté", () => {
    const { queryClient } = renderWithQueryClient();
    // `gcTime` infini pour CETTE clé : le harnais collecte à 0 ms ce que rien n'observe, et une
    // donnée évanouie d'elle-même ferait passer l'assertion de purge sans rien prouver.
    queryClient.setQueryDefaults(["athletes"], { gcTime: Number.POSITIVE_INFINITY });
    queryClient.setQueryData(["athletes"], [{ id: "a-1" }]);
    const clip = renderHook(() => usePlanClipboard());
    act(() =>
      clip.result.current.copyWeek({
        planWeekId: "w-1",
        planId: "plan-1",
        planTitle: "Bloc force — Léa",
        weekNumber: 2,
      }),
    );

    act(() => resetAccountData(queryClient));

    // Les deux, et c'est le point : le cache seul était vidé, le presse-papier nulle part — le
    // coach suivant voyait le titre d'un cycle d'un autre tenant (#341).
    expect(queryClient.getQueryData(["athletes"])).toBeUndefined();
    expect(clip.result.current.clipboard).toBeNull();
  });
});
