// Argent — formatage LOCALISÉ, partagé web ↔ mobile (Intl.NumberFormat des deux côtés). Source
// UNIQUE : ni l'API ni les clients ne recomposent un montant à la main dans le JSX (règle argent).
//
// Un montant est TOUJOURS un entier de centimes (`amountCents`) : jamais un float, dont l'erreur
// d'arrondi corromprait une somme d'argent. La division par 100 n'a lieu qu'ICI, au dernier moment.

// « 49,90 € » — montant d'une facture, dans la devise et la locale de l'utilisateur.
export function formatMoney(amountCents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amountCents / 100);
}

const INVOICE_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * « juillet 2026 » — période facturée (mois civil "YYYY-MM"). `timeZone: "UTC"` est essentiel :
 * comme une date civile, un mois n'a pas d'heure — le lire en local ferait basculer de mois à
 * l'ouest de Greenwich. Lève sur une période illisible (jamais un mois de repli, règle nullable).
 */
export function formatInvoicePeriod(period: string, locale: string): string {
  if (!INVOICE_PERIOD_PATTERN.test(period)) {
    throw new Error(`[money] période illisible : ${period}`);
  }
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
