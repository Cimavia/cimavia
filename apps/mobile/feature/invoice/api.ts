import type { InvoiceDto } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Clés de cache — persistées sur le disque (comme le reste, cf. lecture hors-ligne).
export const invoiceKeys = {
  all: ["invoices"] as const,
  mine: () => ["invoices", "mine"] as const,
};

// Les factures de l'athlète courant (émises), de la plus récente à la plus ancienne. Le scope
// tenant côté API ne renvoie que les siennes.
export function listMyInvoices(): Promise<InvoiceDto[]> {
  return api.get<InvoiceDto[]>("/invoices");
}
