import type { InvoiceDto, PlanBillingInput, UpdateInvoiceStatusInput } from "@cmv/shared";
import { InvoiceStatus } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachInvoiceDocument,
  getPlanBilling,
  invoiceKeys,
  listInvoices,
  removeInvoiceDocument,
  requestInvoiceDocumentUploadUrl,
  savePlanBilling,
  updateInvoiceStatus,
} from "@/feature/invoice/api";
import { planKeys } from "@/feature/plan/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";
import { uploadToSignedUrl } from "@/shared/lib/upload";

export function useInvoices() {
  return useQuery<InvoiceDto[]>({
    queryKey: invoiceKeys.list(),
    queryFn: listInvoices,
  });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UpdateInvoiceStatusInput["status"] }) =>
      updateInvoiceStatus(id, { status }),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.onSuccess(
        invoice.status === InvoiceStatus.PAID ? "invoice.toast.paid" : "invoice.toast.reopened",
      );
    },
    onError: toast.onError,
  });
}

// Termes de facturation DRAFT du cycle (section du builder). `null` tant que rien n'est saisi.
export function usePlanBilling(planId: string) {
  return useQuery<InvoiceDto | null>({
    queryKey: invoiceKeys.billing(planId),
    queryFn: () => getPlanBilling(planId),
  });
}

export function useSavePlanBilling(planId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: (input: PlanBillingInput) => savePlanBilling(planId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.billing(planId) });
      // Le compteur de complétude du cycle (gating de la diffusion) dépend de la facturation.
      queryClient.invalidateQueries({ queryKey: planKeys.all });
      toast.onSuccess("invoice.toast.billingSaved");
    },
    onError: toast.onError,
  });
}

// Joint (ou remplace) le justificatif PDF de la facture DRAFT : URL signée → PUT direct vers le
// storage → rattachement. Le binaire ne transite jamais par l'API (règle 7).
export function useAttachInvoiceDocument(planId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: async (file: File) => {
      const { uploadUrl, storagePath } = await requestInvoiceDocumentUploadUrl(planId, {
        fileName: file.name,
        mimeType: "application/pdf",
        size: file.size,
      });
      await uploadToSignedUrl(uploadUrl, file, () => {});
      return attachInvoiceDocument(planId, {
        storagePath,
        fileName: file.name,
        mimeType: "application/pdf",
        size: file.size,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.billing(planId) });
      toast.onSuccess("invoice.toast.documentAttached");
    },
    onError: toast.onError,
  });
}

export function useRemoveInvoiceDocument(planId: string) {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: () => removeInvoiceDocument(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.billing(planId) });
      toast.onSuccess("invoice.toast.documentRemoved");
    },
    onError: toast.onError,
  });
}

// Ce que compte la tuile « Factures en attente » : les factures encore impayées. `null` tant que
// la liste n'est pas là (« — », jamais un 0 trompeur — règle nullable).
export function pendingCount(invoices: InvoiceDto[] | undefined): number | null {
  if (invoices == null) return null;
  return invoices.filter((invoice) => invoice.status === InvoiceStatus.PENDING).length;
}
