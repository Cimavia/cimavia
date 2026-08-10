import type { InvoiceDto } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { invoiceApi, invoiceKeys } from "@/feature/invoice/api";

/**
 * Les factures ÉMISES de l'acteur courant — le coach celles qu'il a émises, l'athlète les
 * siennes. Une seule route (`GET /invoices`), scopée par le tenant : d'où un seul hook, et un nom
 * qui ne suppose plus un rôle.
 */
export function useInvoices() {
  return useQuery<InvoiceDto[]>({
    queryKey: invoiceKeys.list(),
    queryFn: invoiceApi.list,
  });
}
