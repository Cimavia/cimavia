import type { InvoiceDto, PlanBillingInput, UpdateInvoiceStatusInput } from "@cmv/shared";
import { api } from "@/shared/lib/api";

export const invoiceKeys = {
  all: ["invoices"] as const,
  list: () => ["invoices", "list"] as const,
  // Facturation DRAFT d'un cycle (section du builder).
  billing: (planId: string) => ["invoices", "billing", planId] as const,
};

// Toutes les factures ÉMISES, de la plus récente à la plus ancienne (ordre imposé par l'API).
export function listInvoices(): Promise<InvoiceDto[]> {
  return api.get<InvoiceDto[]>("/invoices");
}

// Toggle payé/impayé : le service pose ou efface `paidAt` selon le statut visé.
export function updateInvoiceStatus(
  id: string,
  input: UpdateInvoiceStatusInput,
): Promise<InvoiceDto> {
  return api.patch<InvoiceDto>(`/invoices/${id}/status`, input);
}

// Termes de facturation (DRAFT) du cycle, ou null tant que le coach n'a rien saisi.
export function getPlanBilling(planId: string): Promise<InvoiceDto | null> {
  return api.get<InvoiceDto | null>(`/plans/${planId}/billing`);
}

export function savePlanBilling(planId: string, input: PlanBillingInput): Promise<InvoiceDto> {
  return api.put<InvoiceDto>(`/plans/${planId}/billing`, input);
}
