import { type InvoiceDto, InvoiceStatus, invoiceKeys } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachInvoiceDocument,
  invoiceApi,
  removeInvoiceDocument,
  requestInvoiceDocumentUploadUrl,
  savePlanBilling,
  invoiceKeys as webInvoiceKeys,
} from "@/feature/invoice/api";
import { planKeys } from "@/feature/plan/api";
import { uploadToSignedUrl } from "@/shared/lib/upload";
import { renderWithQueryClient } from "../../../../test/query";
import {
  useAttachInvoiceDocument,
  useCancelInvoice,
  useInvoices,
  useRemoveInvoiceDocument,
  useSavePlanBilling,
  useUpdateInvoiceStatus,
} from "./useInvoices";

const { listMock, exercisedCapabilityMock, toastMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  exercisedCapabilityMock: vi.fn(),
  toastMock: { onSuccess: vi.fn(), onError: vi.fn() },
}));

// Seuls les appels réseau sont remplacés : `invoiceKeys` doit rester le VRAI, sinon le test
// vérifierait une clé de cache qu'il a lui-même inventée.
vi.mock("@/feature/invoice/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/invoice/api")>()),
  invoiceApi: { list: listMock, updateStatus: vi.fn(), cancel: vi.fn() },
  savePlanBilling: vi.fn(),
  requestInvoiceDocumentUploadUrl: vi.fn(),
  attachInvoiceDocument: vi.fn(),
  removeInvoiceDocument: vi.fn(),
}));
// Le PUT vers le stockage est la frontière du justificatif : `upload.ts` a ses propres tests. Le
// faux rend compte de sa progression, comme le vrai.
vi.mock("@/shared/lib/upload", () => ({
  uploadToSignedUrl: vi.fn(async (_url: string, _file: File, onProgress: (n: number) => void) => {
    onProgress(1);
  }),
}));
vi.mock("@/shared/hook/useMutationToast", () => ({ useMutationToast: () => toastMock }));

// Coupe la session et le routeur : le titre exercé est une ENTRÉE du hook, pas une chose à
// reconstituer ici. `useCapabilities` a ses propres tests à écrire, ailleurs.
vi.mock("@/shared/hook/useCapabilities", () => ({
  useExercisedCapability: () => exercisedCapabilityMock(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  exercisedCapabilityMock.mockReturnValue(null);
});

describe("useInvoices", () => {
  it("rend les factures servies par l'API", async () => {
    listMock.mockResolvedValue([{ id: "inv-1" }]);
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useInvoices(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "inv-1" }]);
  });

  /**
   * Le cas qui justifie le paramètre : sur un compte à double capacité, « émises » et « reçues »
   * sont deux réponses de la MÊME url. Si `as` ne faisait pas partie de la clé, basculer d'espace
   * servirait le cache de l'autre côté — le coach verrait ses propres factures en tant qu'athlète.
   */
  it("range les deux titres dans deux entrées de cache distinctes", async () => {
    listMock.mockResolvedValue([]);
    const { wrapper, queryClient } = renderWithQueryClient();

    exercisedCapabilityMock.mockReturnValue("coach");
    const coach = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(coach.result.current.isSuccess).toBe(true));

    exercisedCapabilityMock.mockReturnValue("athlete");
    const athlete = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(athlete.result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(invoiceKeys.list("coach"))).toBeDefined();
    expect(queryClient.getQueryData(invoiceKeys.list("athlete"))).toBeDefined();
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("transmet le titre exercé à l'API, et non une valeur devinée", async () => {
    listMock.mockResolvedValue([]);
    exercisedCapabilityMock.mockReturnValue("athlete");
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useInvoices(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listMock).toHaveBeenCalledWith("athlete");
  });

  it("expose l'échec au lieu de rendre une liste vide", async () => {
    listMock.mockRejectedValue(new Error("503"));
    const { wrapper } = renderWithQueryClient();

    const { result } = renderHook(() => useInvoices(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

const invoice = (status: InvoiceDto["status"]) => ({ id: "inv-1", status }) as InvoiceDto;

/** Monte un hook de mutation et espionne ce qu'il périme dans le cache. */
function mountMutation<T>(hook: () => T) {
  const { wrapper, queryClient } = renderWithQueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  return { ...renderHook(hook, { wrapper }), invalidate };
}

describe("useUpdateInvoiceStatus", () => {
  it.each([
    [InvoiceStatus.PAID, "invoice.toast.paid"],
    [InvoiceStatus.PENDING, "invoice.toast.reopened"],
  ])("passe la facture en %s, relit les factures et le dit", async (status, toastKey) => {
    vi.mocked(invoiceApi.updateStatus).mockResolvedValue(invoice(status));
    const { result, invalidate } = mountMutation(() => useUpdateInvoiceStatus());

    act(() => result.current.mutate({ id: "inv-1", status }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invoiceApi.updateStatus).toHaveBeenCalledWith("inv-1", { status });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: invoiceKeys.all });
    expect(toastMock.onSuccess).toHaveBeenCalledWith(toastKey);
  });

  it("dit l'échec", async () => {
    const failure = new Error("409");
    vi.mocked(invoiceApi.updateStatus).mockRejectedValue(failure);
    const { result } = mountMutation(() => useUpdateInvoiceStatus());

    act(() => result.current.mutate({ id: "inv-1", status: InvoiceStatus.PAID }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastMock.onError.mock.lastCall?.[0]).toBe(failure);
  });
});

describe("useCancelInvoice", () => {
  it("annule, relit les factures et le dit", async () => {
    vi.mocked(invoiceApi.cancel).mockResolvedValue(invoice(InvoiceStatus.CANCELLED));
    const { result, invalidate } = mountMutation(() => useCancelInvoice());

    act(() => result.current.mutate("inv-1"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invoiceApi.cancel).toHaveBeenCalledWith("inv-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: invoiceKeys.all });
    expect(toastMock.onSuccess).toHaveBeenCalledWith("invoice.toast.cancelled");
  });

  it("dit l'échec", async () => {
    vi.mocked(invoiceApi.cancel).mockRejectedValue(new Error("409"));
    const { result } = mountMutation(() => useCancelInvoice());

    act(() => result.current.mutate("inv-1"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastMock.onError).toHaveBeenCalled();
  });
});

describe("useSavePlanBilling", () => {
  // La complétude du cycle — qui ferme ou ouvre la diffusion — dépend de la facturation.
  it("enregistre les termes, puis périme la facturation ET les cycles", async () => {
    vi.mocked(savePlanBilling).mockResolvedValue(invoice(InvoiceStatus.DRAFT));
    const { result, invalidate } = mountMutation(() => useSavePlanBilling("p-1"));
    const input = { amountCents: 4990, dueDate: "2026-10-31", note: null };

    act(() => result.current.mutate(input));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(savePlanBilling).toHaveBeenCalledWith("p-1", input);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: webInvoiceKeys.billing("p-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: planKeys.all });
    expect(toastMock.onSuccess).toHaveBeenCalledWith("invoice.toast.billingSaved");
  });

  it("dit l'échec", async () => {
    vi.mocked(savePlanBilling).mockRejectedValue(new Error("409"));
    const { result } = mountMutation(() => useSavePlanBilling("p-1"));

    act(() => result.current.mutate({ amountCents: 1, dueDate: "2026-10-31", note: null }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastMock.onError).toHaveBeenCalled();
  });
});

describe("useAttachInvoiceDocument", () => {
  const pdf = new File(["%PDF"], "facture.pdf", { type: "application/pdf" });

  // Url signée → PUT direct vers le stockage → rattachement : le binaire ne passe jamais par l'API.
  it("dépose le PDF au stockage, puis le rattache à la facture du cycle", async () => {
    vi.mocked(requestInvoiceDocumentUploadUrl).mockResolvedValue({
      uploadUrl: "https://s3/signé",
      storagePath: "p-1/facture.pdf",
    } as never);
    vi.mocked(attachInvoiceDocument).mockResolvedValue(invoice(InvoiceStatus.DRAFT));
    const { result, invalidate } = mountMutation(() => useAttachInvoiceDocument("p-1"));

    act(() => result.current.mutate(pdf));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const document = { fileName: "facture.pdf", mimeType: "application/pdf", size: pdf.size };
    expect(requestInvoiceDocumentUploadUrl).toHaveBeenCalledWith("p-1", document);
    expect(uploadToSignedUrl).toHaveBeenCalledWith("https://s3/signé", pdf, expect.any(Function));
    expect(attachInvoiceDocument).toHaveBeenCalledWith("p-1", {
      ...document,
      storagePath: "p-1/facture.pdf",
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: webInvoiceKeys.billing("p-1") });
    expect(toastMock.onSuccess).toHaveBeenCalledWith("invoice.toast.documentAttached");
  });

  it("ne rattache rien quand le dépôt échoue", async () => {
    vi.mocked(requestInvoiceDocumentUploadUrl).mockResolvedValue({
      uploadUrl: "https://s3/signé",
      storagePath: "p-1/facture.pdf",
    } as never);
    vi.mocked(uploadToSignedUrl).mockRejectedValueOnce(new Error("403"));
    const { result } = mountMutation(() => useAttachInvoiceDocument("p-1"));

    act(() => result.current.mutate(pdf));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(attachInvoiceDocument).not.toHaveBeenCalled();
    expect(toastMock.onError).toHaveBeenCalled();
  });
});

describe("useRemoveInvoiceDocument", () => {
  it("retire le justificatif et relit la facturation", async () => {
    vi.mocked(removeInvoiceDocument).mockResolvedValue(invoice(InvoiceStatus.DRAFT));
    const { result, invalidate } = mountMutation(() => useRemoveInvoiceDocument("p-1"));

    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(removeInvoiceDocument).toHaveBeenCalledWith("p-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: webInvoiceKeys.billing("p-1") });
    expect(toastMock.onSuccess).toHaveBeenCalledWith("invoice.toast.documentRemoved");
  });

  it("dit l'échec", async () => {
    vi.mocked(removeInvoiceDocument).mockRejectedValue(new Error("500"));
    const { result } = mountMutation(() => useRemoveInvoiceDocument("p-1"));

    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastMock.onError).toHaveBeenCalled();
  });
});
