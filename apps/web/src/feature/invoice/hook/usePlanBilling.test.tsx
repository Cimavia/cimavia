import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanBilling } from "@/feature/invoice/hook/useInvoices";
import { renderWithQueryClient } from "../../../../test/query";

const { getPlanBillingMock } = vi.hoisted(() => ({ getPlanBillingMock: vi.fn() }));

vi.mock("@/feature/invoice/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/invoice/api")>()),
  getPlanBilling: getPlanBillingMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * L'API REFUSE cette lecture (409) sur un cycle qu'on ne peut pas facturer : sans destinataire
 * (#144) comme en auto-coaching (#14). La poser quand même coûterait deux requêtes vouées à
 * l'échec — `retry: 1` en production — pour une réponse qu'on connaît déjà.
 */
describe("usePlanBilling", () => {
  it("lit les termes d'un cycle facturable", async () => {
    getPlanBillingMock.mockResolvedValue({ id: "inv_1" });
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanBilling("pln_1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getPlanBillingMock).toHaveBeenCalledWith("pln_1");
  });

  it("ne pose aucune requête pour un cycle qu'on ne peut pas facturer", async () => {
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanBilling("pln_1", false), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(getPlanBillingMock).not.toHaveBeenCalled();
  });
});
