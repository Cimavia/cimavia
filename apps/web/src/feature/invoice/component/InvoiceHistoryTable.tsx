import {
  type InvoiceDto,
  InvoiceState,
  InvoiceStatus,
  pageOfInvoices,
  resolveInvoiceState,
  todayIsoDate,
} from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { InvoiceStatusBadge } from "@/feature/invoice/component/InvoiceStatusBadge";
import { CMV_TABLE, CmvButton } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values invoice.history.columns: HISTORY_COLUMNS

/**
 * L'historique de facturation d'UN athlète, déplié sous sa ligne (#120, maquette frames 2 à 4).
 *
 * L'ordre vient de `@cmv/shared` (`sortAthleteInvoices`, appliqué à la construction de la ligne) :
 * les retards en tête, puis les plus récentes d'abord. Ce composant ne fait que le DÉCOUPER en
 * pages — la décision d'ordre est une décision produit, elle est mesurée ailleurs.
 */

const HISTORY_COLUMNS = ["period", "amount", "dueDate"] as const;

/** L'en-tête et les lignes partagent leur grille — sinon les intitulés se décalent du contenu. */
const GRID = "grid grid-cols-[1.4fr_1fr_2fr_auto] items-center gap-cmv-lg";

type InvoiceHistoryTableProps = {
  /** Déjà triées. Non vide : une ligne d'athlète naît d'au moins une facture. */
  invoices: readonly InvoiceDto[];
  onOpenInvoice: (invoiceId: string) => void;
};

export function InvoiceHistoryTable({
  invoices,
  onOpenInvoice,
}: Readonly<InvoiceHistoryTableProps>) {
  const { t } = useTranslation();
  /**
   * La page vit ICI, et non dans l'URL : elle appartient à un athlète déplié et meurt avec lui.
   * Replier puis rouvrir repart donc de la première page — celle des retards, qui est la bonne.
   */
  const [page, setPage] = useState(1);
  const shown = pageOfInvoices(invoices, page);

  return (
    <div className={cn(CMV_TABLE.frame, "bg-cmv-bg-1")}>
      <div className={cn(GRID, CMV_TABLE.head, CMV_TABLE.headBorder, "px-cmv-md py-cmv-sm")}>
        {HISTORY_COLUMNS.map((column) => (
          <span key={column} className={CMV_TABLE.headLabel}>
            {t(`invoice.history.columns.${column}`)}
          </span>
        ))}
        {/* La colonne de la pastille n'a pas d'intitulé : l'état se lit sans qu'on le nomme. */}
        <span />
      </div>

      {shown.items.map((invoice) => (
        <button
          key={invoice.id}
          type="button"
          onClick={() => onOpenInvoice(invoice.id)}
          className={cn(
            GRID,
            CMV_TABLE.row,
            "w-full px-cmv-md py-cmv-sm text-left transition-colors hover:bg-cmv-surface",
          )}
        >
          <span className="text-cmv-text-hi">{formatPeriod(invoice.period)}</span>
          <span
            className={cn(
              "font-cmv-display",
              invoice.status === InvoiceStatus.CANCELLED
                ? "text-cmv-text-lo line-through"
                : "text-cmv-text-hi",
            )}
          >
            {formatMoney(invoice.amountCents, invoice.currency)}
          </span>
          <DueCell invoice={invoice} />
          <InvoiceStatusBadge invoice={invoice} />
        </button>
      ))}

      {/* Une seule page : ni compteur ni boutons. Une pagination qui ne pagine rien est du bruit. */}
      {shown.pageCount <= 1 ? null : (
        <div className="flex flex-wrap items-center justify-between gap-cmv-sm border-cmv-border border-t px-cmv-md py-cmv-sm">
          <span className="text-cmv-caption text-cmv-text-lo">
            {t("invoice.history.range", {
              from: shown.from,
              to: shown.to,
              total: shown.total,
            })}
          </span>
          <div className="flex items-center gap-cmv-xs">
            {Array.from({ length: shown.pageCount }, (_, index) => index + 1).map((number) => (
              <CmvButton
                key={number}
                variant={number === shown.page ? "secondary" : "ghost"}
                onClick={() => setPage(number)}
              >
                {String(number)}
              </CmvButton>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * La colonne d'échéance dit ce qui s'est passé, pas seulement une date : « Payée le 3 mars » pour
 * une facture réglée, « Échue le 5 août » pour un retard — et c'est le seul endroit du tableau où
 * l'on voit à quel point il est ancien.
 */
function DueCell({ invoice }: Readonly<{ invoice: InvoiceDto }>) {
  const { t } = useTranslation();
  const state = resolveInvoiceState(invoice, todayIsoDate());

  if (invoice.status === InvoiceStatus.PAID && invoice.paidAt != null) {
    return (
      <span className="text-cmv-text-mid">
        {/* `paidAt` est un INSTANT, la colonne parle d'un jour : tronqué en date civile. */}
        {t("invoice.history.paidOn", { date: formatDate(invoice.paidAt.slice(0, 10)) })}
      </span>
    );
  }

  if (state === InvoiceState.OVERDUE) {
    return (
      <span className="text-cmv-error-on">
        {t("invoice.history.overdueOn", { date: formatDate(invoice.dueDate) })}
      </span>
    );
  }

  return (
    <span className="text-cmv-text-mid">
      {t("invoice.dueLabel", { date: formatDate(invoice.dueDate) })}
    </span>
  );
}
