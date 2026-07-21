import type { CreateInvoiceInput, InvoiceDto, UpdateInvoiceStatusInput } from "@cmv/shared";
import { api } from "@/shared/lib/api";

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: () => ["invoices", "list"] as const,
};

// Toutes les factures émises, de la plus récente à la plus ancienne (ordre imposé par l'API).
export function listInvoices(): Promise<InvoiceDto[]> {
  return api.get<InvoiceDto[]>("/invoices");
}

export function createInvoice(input: CreateInvoiceInput): Promise<InvoiceDto> {
  return api.post<InvoiceDto>("/invoices", input);
}

// Toggle payé/impayé : le service pose ou efface `paidAt` selon le statut visé.
export function updateInvoiceStatus(
  id: string,
  input: UpdateInvoiceStatusInput,
): Promise<InvoiceDto> {
  return api.patch<InvoiceDto>(`/invoices/${id}/status`, input);
}
