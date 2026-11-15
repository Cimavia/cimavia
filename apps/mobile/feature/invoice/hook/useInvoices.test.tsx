import { invoiceKeys, notificationKeys, reminderKeys } from "@cmv/shared";
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

/**
 * Depuis #349, la même requête clôt le rappel « en retard » de la facture : liste des rappels, tuile
 * du tableau de bord et pastille doivent tomber avec les factures, pas au polling suivant (#485).
 */
function expectInvoiceTransitionInvalidated(invalidate: ReturnType<typeof vi.spyOn>) {
  expect(invalidate).toHaveBeenCalledWith({ queryKey: invoiceKeys.all });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: reminderKeys.all });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.all });
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
   * de facturation de la même donnée, et une facture annulée doit en sortir aussi. Le rappel
   * « en retard » qu'elle portait est clos par l'API : rappels et notifications tombent avec elle.
   */
  it("invalide toute la racine des factures, les rappels et les notifications", async () => {
    cancelMock.mockResolvedValue({ id: "inv-1" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCancelInvoice(), { wrapper });

    result.current.mutate("inv-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectInvoiceTransitionInvalidated(invalidate);
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
  // Remise à régler comprise : l'API ne rouvre pas le rappel, mais c'est à elle d'en décider.
  it.each(["PAID", "PENDING"] as const)(
    "transmet le statut %s, puis invalide factures, rappels et notifications",
    async (status) => {
      updateStatusMock.mockResolvedValue({ id: "inv-1" });
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useUpdateInvoiceStatus(), { wrapper });

      result.current.mutate({ id: "inv-1", status });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(updateStatusMock).toHaveBeenCalledWith("inv-1", { status });
      expectInvoiceTransitionInvalidated(invalidate);
    },
  );

  it("n'invalide rien quand le changement de statut échoue", async () => {
    updateStatusMock.mockRejectedValue(new Error("409"));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateInvoiceStatus(), { wrapper });

    result.current.mutate({ id: "inv-1", status: "PAID" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
