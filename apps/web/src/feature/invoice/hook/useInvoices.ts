import type { InvoiceDto, PlanBillingInput, UpdateInvoiceStatusInput } from "@cmv/shared";
import { InvoiceStatus } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPlanBilling,
  invoiceKeys,
  listInvoices,
  savePlanBilling,
  updateInvoiceStatus,
} from "@/feature/invoice/api";
import { planKeys } from "@/feature/plan/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

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

// Ce que compte la tuile « Factures en attente » : les factures encore impayées. `null` tant que
// la liste n'est pas là (« — », jamais un 0 trompeur — règle nullable).
export function pendingCount(invoices: InvoiceDto[] | undefined): number | null {
  if (invoices == null) return null;
  return invoices.filter((invoice) => invoice.status === InvoiceStatus.PENDING).length;
}
