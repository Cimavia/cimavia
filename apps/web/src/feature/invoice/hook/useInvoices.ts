import type {
  CreateInvoiceInput,
  InvoiceDto,
  InvoiceStatusType,
  UpdateInvoiceStatusInput,
} from "@cmv/shared";
import { InvoiceStatus } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createInvoice,
  invoiceKeys,
  listInvoices,
  updateInvoiceStatus,
} from "@/feature/invoice/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

export function useInvoices() {
  return useQuery<InvoiceDto[]>({
    queryKey: invoiceKeys.list(),
    queryFn: listInvoices,
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => createInvoice(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.onSuccess("invoice.toast.issued");
    },
    onError: toast.onError,
  });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatusType }) =>
      updateInvoiceStatus(id, { status } satisfies UpdateInvoiceStatusInput),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      toast.onSuccess(
        invoice.status === InvoiceStatus.PAID ? "invoice.toast.paid" : "invoice.toast.reopened",
      );
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
