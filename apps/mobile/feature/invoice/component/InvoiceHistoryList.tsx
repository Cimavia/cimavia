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
import { Pressable, View } from "react-native";
import { InvoiceStatusBadge } from "@/feature/invoice/component/InvoiceStatusBadge";
import { CmvText } from "@/shared/component";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

/**
 * L'historique de facturation d'UN athlète, déplié sous sa ligne (#224, maquette frame 2).
 *
 * L'ordre vient de `@cmv/shared` (`sortAthleteInvoices`, appliqué à la construction de la ligne) :
 * les retards en tête, puis les plus récentes d'abord. Ce composant ne fait que le DÉCOUPER en
 * pages — la décision d'ordre est une décision produit, elle est mesurée ailleurs.
 *
 * Pas d'en-tête de colonnes, contrairement au web : sur 400 px chaque facture se lit seule, et
 * trois intitulés au-dessus de cinq lignes prendraient la place d'une sixième.
 */

type InvoiceHistoryListProps = {
  /** Déjà triées. Non vide : une ligne d'athlète naît d'au moins une facture. */
  invoices: readonly InvoiceDto[];
  onOpenInvoice: (invoiceId: string) => void;
};

export function InvoiceHistoryList({ invoices, onOpenInvoice }: Readonly<InvoiceHistoryListProps>) {
  const { t } = useTranslation();
  /**
   * La page vit ICI, et meurt avec le déplié : replier puis rouvrir repart de la première page —
   * celle des retards, qui est la bonne.
   */
  const [page, setPage] = useState(1);
  const shown = pageOfInvoices(invoices, page);

  return (
    <View className="rounded-b-lg border border-cmv-border border-t-0 bg-cmv-bg-0">
      {shown.items.map((invoice) => (
        <Pressable
          key={invoice.id}
          onPress={() => onOpenInvoice(invoice.id)}
          className="gap-1 border-cmv-border border-b px-4 py-3"
        >
          <View className="flex-row items-center gap-2">
            <CmvText className="flex-1 text-cmv-text-hi text-sm" numberOfLines={1}>
              {formatPeriod(invoice.period)}
            </CmvText>
            <CmvText
              className={
                invoice.status === InvoiceStatus.CANCELLED
                  ? "font-cmv-display text-cmv-text-lo line-through"
                  : "font-cmv-display text-cmv-text-hi"
              }
            >
              {formatMoney(invoice.amountCents, invoice.currency)}
            </CmvText>
            <InvoiceStatusBadge invoice={invoice} />
          </View>
          <DueLine invoice={invoice} />
        </Pressable>
      ))}

      {/* Une seule page : ni compteur ni boutons. Une pagination qui ne pagine rien est du bruit. */}
      {shown.pageCount <= 1 ? null : (
        <View className="flex-row items-center justify-between gap-2 px-4 py-3">
          <CmvText className="text-cmv-text-lo text-xs">
            {t("invoice.coach.history.range", {
              from: shown.from,
              to: shown.to,
              total: shown.total,
            })}
          </CmvText>
          <View className="flex-row gap-2">
            {Array.from({ length: shown.pageCount }, (_, index) => index + 1).map((number) => (
              <Pressable
                key={number}
                onPress={() => setPage(number)}
                accessibilityState={{ selected: number === shown.page }}
                className={`min-w-9 items-center rounded-md border px-2 py-1 ${
                  number === shown.page
                    ? "border-cmv-border-hi bg-cmv-surface-hi"
                    : "border-cmv-border"
                }`}
              >
                <CmvText
                  className={`text-xs ${
                    number === shown.page ? "text-cmv-text-hi" : "text-cmv-text-mid"
                  }`}
                >
                  {String(number)}
                </CmvText>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Ce qui est ARRIVÉ à la facture, pas seulement une date : « Payée le 3 mai » pour une réglée,
 * « Échue le 5 août » pour un retard.
 *
 * Une facture ANNULÉE tombe dans le dernier cas et montre son échéance : le modèle ne porte aucune
 * date d'annulation, et en inventer une — « Annulée le … » — afficherait un jour qui n'existe pas.
 */
function DueLine({ invoice }: Readonly<{ invoice: InvoiceDto }>) {
  const { t } = useTranslation();
  const state = resolveInvoiceState(invoice, todayIsoDate());

  if (invoice.status === InvoiceStatus.PAID && invoice.paidAt != null) {
    return (
      <CmvText className="text-cmv-text-mid text-xs">
        {/* `paidAt` est un INSTANT, la ligne parle d'un jour : tronqué en date civile. */}
        {t("invoice.coach.history.paidOn", { date: formatDate(invoice.paidAt.slice(0, 10)) })}
      </CmvText>
    );
  }

  if (state === InvoiceState.OVERDUE) {
    return (
      <CmvText className="text-cmv-error-on text-xs">
        {t("invoice.coach.history.overdueOn", { date: formatDate(invoice.dueDate) })}
      </CmvText>
    );
  }

  return (
    <CmvText className="text-cmv-text-mid text-xs">
      {t("invoice.dueLabel", { date: formatDate(invoice.dueDate) })}
    </CmvText>
  );
}
