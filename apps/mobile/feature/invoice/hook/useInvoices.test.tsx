import { invoiceKeys } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCancelInvoice, useUpdateInvoiceStatus } from "@/feature/invoice/hook/useInvoices";

const { updateStatusMock, cancelMock } = vi.hoisted(() => ({
  updateStatusMock: vi.fn(),
  cancelMock: vi.fn(),
}));

// Seul `invoiceApi` est remplacé : `invoiceKeys` doit rester le VRAI, sinon le test vérifierait une
// clé de cache qu'il a lui-même inventée.
vi.mock("@/feature/invoice/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/invoice/api")>()),
  invoiceApi: { updateStatus: updateStatusMock, cancel: cancelMock },
}));

let queryClient: QueryClient;

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
});

describe("useCancelInvoice", () => {
  /**
   * Un endpoint DÉDIÉ, et non le toggle de statut : l'API n'accepte l'annulation que depuis
   * `PENDING` et refuse ensuite tout retour en 409. Passer par `PATCH /status` contournerait
   * précisément cette garde.
   */
  it("appelle l'annulation dédiée", async () => {
    cancelMock.mockResolvedValue({ id: "inv-1" });
    const { result } = renderHook(() => useCancelInvoice(), { wrapper });

    result.current.mutate("inv-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cancelMock).toHaveBeenCalledWith("inv-1");
  });

  /**
   * La RACINE du cache est invalidée, pas la seule liste : le tableau de bord tire ses deux tuiles
   * de facturation de la même donnée, et une facture annulée doit en sortir aussi.
   */
  it("invalide toute la racine des factures", async () => {
    cancelMock.mockResolvedValue({ id: "inv-1" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCancelInvoice(), { wrapper });

    result.current.mutate("inv-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: invoiceKeys.all });
  });

  // L'échec ne doit pas invalider : rien n'a changé côté serveur, et rafraîchir masquerait l'erreur.
  it("n'invalide rien quand l'annulation échoue", async () => {
    cancelMock.mockRejectedValue(new Error("409"));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCancelInvoice(), { wrapper });

    result.current.mutate("inv-1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useUpdateInvoiceStatus", () => {
  it("transmet le statut demandé et invalide la racine", async () => {
    updateStatusMock.mockResolvedValue({ id: "inv-1" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateInvoiceStatus(), { wrapper });

    result.current.mutate({ id: "inv-1", status: "PAID" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateStatusMock).toHaveBeenCalledWith("inv-1", { status: "PAID" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: invoiceKeys.all });
  });
});
