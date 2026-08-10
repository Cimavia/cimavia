import type {
  AttachInvoiceDocumentInput,
  InvoiceDto,
  PlanBillingInput,
  RequestInvoiceDocumentUploadUrlInput,
  UploadUrlDto,
} from "@cmv/shared";
import { createInvoiceApi, invoiceKeys as sharedInvoiceKeys } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Routes, DTO et clés de cache des factures émises vivent dans @cmv/shared : le mobile appelle
// exactement les mêmes. Ne reste ici que l'injection du client web (cookie du navigateur).
export const invoiceApi = createInvoiceApi(api);

/**
 * Clés partagées, plus celle que le web est seul à avoir : la **facturation d'un cycle** (DRAFT)
 * se saisit dans le builder de planification, qui reste web-only (#20). Elle s'ajoute ici plutôt
 * que de polluer le module partagé d'une clé qu'un seul client utilisera jamais.
 */
export const invoiceKeys = {
  ...sharedInvoiceKeys,
  billing: (planId: string) => ["invoices", "billing", planId] as const,
};

// ── Facturation d'un cycle (web-only) ────────────────────────────────────────

// Termes de facturation (DRAFT) du cycle, ou null tant que le coach n'a rien saisi.
export function getPlanBilling(planId: string): Promise<InvoiceDto | null> {
  return api.get<InvoiceDto | null>(`/plans/${planId}/billing`);
}

export function savePlanBilling(planId: string, input: PlanBillingInput): Promise<InvoiceDto> {
  return api.put<InvoiceDto>(`/plans/${planId}/billing`, input);
}

// ── Justificatif PDF ──────────────────────────────────────────────────────────

export function requestInvoiceDocumentUploadUrl(
  planId: string,
  input: RequestInvoiceDocumentUploadUrlInput,
): Promise<UploadUrlDto> {
  return api.post<UploadUrlDto>(`/plans/${planId}/billing/document/upload-url`, input);
}

export function attachInvoiceDocument(
  planId: string,
  input: AttachInvoiceDocumentInput,
): Promise<InvoiceDto> {
  return api.put<InvoiceDto>(`/plans/${planId}/billing/document`, input);
}

export function removeInvoiceDocument(planId: string): Promise<InvoiceDto> {
  return api.delete<InvoiceDto>(`/plans/${planId}/billing/document`);
}
