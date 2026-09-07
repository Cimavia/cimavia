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
 * L'API TOLÈRE cette lecture partout depuis #211 : `enabled` n'évite plus une erreur, il évite un
 * aller-retour dont on tient déjà la réponse — un cycle diffusé, sans destinataire ou écrit pour
 * soi n'a aucun brouillon à lire.
 */
describe("usePlanBilling", () => {
  it("lit les termes d'un cycle facturable", async () => {
    getPlanBillingMock.mockResolvedValue({ id: "inv_1" });
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanBilling("pln_1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getPlanBillingMock).toHaveBeenCalledWith("pln_1");
  });

  it("ne pose aucune requête pour un cycle dont on sait qu'il n'a pas de brouillon", async () => {
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => usePlanBilling("pln_1", false), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(getPlanBillingMock).not.toHaveBeenCalled();
  });
});
