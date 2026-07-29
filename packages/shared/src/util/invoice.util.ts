import { InvoiceStatus } from "../dto/invoice.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { isIsoDate } from "./date.util";

export const InvoiceState = {
  PENDING: "PENDING",
  OVERDUE: "OVERDUE",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;
export type InvoiceState = TypesValuesOf<typeof InvoiceState>;

export type InvoiceTiming = { status: InvoiceStatus; dueDate: string };

export type InvoiceStateBadge = {
  variant: "success" | "warning" | "error" | "neutral";
  labelKey: string;
};

export const INVOICE_STATE_BADGE = {
  [InvoiceState.PAID]: { variant: "success", labelKey: "invoice.status.paid" },
  [InvoiceState.PENDING]: { variant: "warning", labelKey: "invoice.status.pending" },
  [InvoiceState.OVERDUE]: { variant: "error", labelKey: "invoice.status.overdue" },
  [InvoiceState.CANCELLED]: { variant: "neutral", labelKey: "invoice.status.cancelled" },
} as const satisfies Record<InvoiceState, InvoiceStateBadge>;

export function resolveInvoiceState(invoice: InvoiceTiming, today: string): InvoiceState | null {
  if (invoice.status === InvoiceStatus.PAID) return InvoiceState.PAID;
  if (invoice.status === InvoiceStatus.CANCELLED) return InvoiceState.CANCELLED;
  if (invoice.status !== InvoiceStatus.PENDING) return null;

  if (!isIsoDate(invoice.dueDate) || !isIsoDate(today)) return null;
  return invoice.dueDate < today ? InvoiceState.OVERDUE : InvoiceState.PENDING;
}
