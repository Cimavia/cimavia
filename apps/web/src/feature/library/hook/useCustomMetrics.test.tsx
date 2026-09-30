import type { CustomMetric } from "@cmv/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customMetricKeys } from "@/feature/library/api";
import { renderWithQueryClient } from "../../../../test/query";
import {
  useCreateCustomMetric,
  useCustomMetrics,
  useDeleteCustomMetric,
  useUpdateCustomMetric,
} from "./useCustomMetrics";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    listCustomMetrics: vi.fn(),
    createCustomMetric: vi.fn(),
    updateCustomMetric: vi.fn(),
    deleteCustomMetric: vi.fn(),
  },
}));

// Les appels sont remplacés, les clés restent les VRAIES.
vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  ...apiMock,
}));

const metric = { id: "m-1", label: "Prises" } as unknown as CustomMetric;
const definition = { label: "Prises", unit: null, valueType: "NUMBER", scale: null } as const;

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Le serveur est seul à connaître l'identifiant attribué : chaque écriture RELIT la liste, et
 * seulement si elle a réussi. Le client de test a `gcTime: 0` — une entrée posée sans observateur
 * disparaît aussitôt, son état d'invalidation avec elle —, on observe donc la demande.
 */
async function expectWriteThenReload<V>(
  useHook: () => UseMutationResult<unknown, Error, V>,
  variables: V,
  call: Mock,
  expectedArgs: unknown[],
) {
  const { wrapper, queryClient } = renderWithQueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(() => useHook(), { wrapper });

  call.mockRejectedValueOnce(new Error("409"));
  await expect(act(() => result.current.mutateAsync(variables))).rejects.toThrow("409");
  expect(invalidate).not.toHaveBeenCalled();

  call.mockResolvedValueOnce(metric);
  await act(() => result.current.mutateAsync(variables));
  expect(call).toHaveBeenLastCalledWith(...expectedArgs);
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: customMetricKeys.all });
}

describe("useCustomMetrics", () => {
  it("rend les métriques maison du coach", async () => {
    apiMock.listCustomMetrics.mockResolvedValue([metric]);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useCustomMetrics(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([metric]));
  });
});

describe("écritures", () => {
  it("création : relit la liste après un succès, jamais après un échec", async () => {
    await expectWriteThenReload(useCreateCustomMetric, definition, apiMock.createCustomMetric, [
      definition,
    ]);
  });

  it("mise à jour : relit la liste après un succès, jamais après un échec", async () => {
    await expectWriteThenReload(
      useUpdateCustomMetric,
      { id: "m-1", input: definition },
      apiMock.updateCustomMetric,
      ["m-1", definition],
    );
  });

  it("suppression : relit la liste après un succès, jamais après un échec", async () => {
    await expectWriteThenReload(useDeleteCustomMetric, "m-1", apiMock.deleteCustomMetric, ["m-1"]);
  });
});
