import type { InvoiceDto } from "@cmv/shared";
import { useQuery } from "@tanstack/react-query";
import { invoiceKeys, listMyInvoices } from "@/feature/invoice/api";

// Lecture seule côté athlète (il consulte, le coach émet et marque le statut). Cache persisté.
export function useMyInvoices() {
  return useQuery<InvoiceDto[]>({
    queryKey: invoiceKeys.mine(),
    queryFn: listMyInvoices,
  });
}
