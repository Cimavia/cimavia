import { formatInvoicePeriod, formatMoney as sharedFormatMoney } from "@cmv/shared";
import i18n from "@/shared/lib/i18n";

/**
 * Adaptateur d'affichage argent : le formatage (et la division par 100) vit dans @cmv/shared ; on
 * ne fait ici que fournir la locale courante d'i18next.
 */
export function formatMoney(amountCents: number, currency: string): string {
  return sharedFormatMoney(amountCents, currency, i18n.language);
}

export function formatPeriod(period: string): string {
  return formatInvoicePeriod(period, i18n.language);
}
