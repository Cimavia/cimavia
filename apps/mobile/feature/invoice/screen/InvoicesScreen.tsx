import { type InvoiceDto, InvoiceStatus } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { useMyInvoices } from "@/feature/invoice/hook/useMyInvoices";
import { CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

// Onglet Factures (p6-3) : l'athlète consulte les factures émises par son coach. Lecture seule —
// le statut (payé/en attente) est posé par le coach.
export function InvoicesScreen() {
  const { t } = useTranslation();
  const { data: invoices, isPending, isError, isRefetching, refetch } = useMyInvoices();

  // Refetch à chaque fois que l'écran passe au premier plan — notamment à l'ouverture depuis la
  // notification « Nouvelle facture » : sans ça, le cache persisté afficherait l'ancienne liste.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const hasInvoices = invoices != null && invoices.length > 0;

  return (
    <CmvScreen>
      <OfflineBanner />

      <View className="px-4 pt-4">
        <CmvText className="font-cmv-display text-cmv-text-hi text-xl">
          {t("invoice.title")}
        </CmvText>
      </View>

      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-4 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            // Le spinner est natif : il ignore les className, d'où la valeur (issue des tokens).
            tintColor={cmvColors.accent.DEFAULT}
          />
        }
      >
        {isPending ? <ActivityIndicator /> : null}

        {isError && invoices == null ? <CmvErrorState onRetry={() => refetch()} /> : null}

        {!isPending && !isError && !hasInvoices ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">{t("invoice.empty.title")}</CmvText>
            <CmvText className="text-cmv-text-mid text-sm">
              {t("invoice.empty.description")}
            </CmvText>
          </View>
        ) : null}

        {(invoices ?? []).map((invoice) => (
          <InvoiceCard key={invoice.id} invoice={invoice} />
        ))}
      </ScrollView>
    </CmvScreen>
  );
}

function InvoiceCard({ invoice }: Readonly<{ invoice: InvoiceDto }>) {
  const { t } = useTranslation();
  const isPaid = invoice.status === InvoiceStatus.PAID;

  return (
    <View className="gap-2 rounded-lg border border-cmv-border bg-cmv-bg-1 p-4">
      <View className="flex-row items-center justify-between">
        {/* Le cycle facturé — cœur du lien facture ↔ planification. */}
        <CmvText className="flex-1 text-cmv-text-hi">{invoice.planTitle ?? "—"}</CmvText>
        <View
          className={
            isPaid
              ? "rounded-full border border-cmv-border px-2 py-1"
              : "rounded-full bg-cmv-accent-soft px-2 py-1"
          }
        >
          <CmvText className={isPaid ? "text-cmv-text-mid text-xs" : "text-cmv-accent text-xs"}>
            {isPaid ? t("invoice.status.paid") : t("invoice.status.pending")}
          </CmvText>
        </View>
      </View>

      <CmvText className="font-cmv-display text-2xl text-cmv-text-hi">
        {formatMoney(invoice.amountCents, invoice.currency)}
      </CmvText>

      <CmvText className="text-cmv-text-mid text-sm">
        {t("invoice.byCoach", { name: invoice.coachName })} ·{" "}
        {t("invoice.periodLabel", { period: formatPeriod(invoice.period) })}
      </CmvText>

      <CmvText className="text-cmv-text-lo text-xs">
        {t("invoice.dueLabel", { date: formatDate(invoice.dueDate) })}
        {/* paidAt null tant qu'impayée : on n'affiche la date de règlement que si elle existe. */}
        {isPaid && invoice.paidAt != null
          ? ` · ${t("invoice.paidAtLabel", { date: formatDate(invoice.paidAt.slice(0, 10)) })}`
          : ""}
      </CmvText>

      {invoice.note == null ? null : (
        <CmvText className="text-cmv-text-mid text-sm">{invoice.note}</CmvText>
      )}
    </View>
  );
}
