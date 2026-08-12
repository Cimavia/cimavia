import {
  type InvoiceDto,
  InvoiceState,
  InvoiceStatus,
  resolveInvoiceState,
  todayIsoDate,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { InvoiceStatusBadge } from "@/feature/invoice/component/InvoiceStatusBadge";
import { useInvoices, useUpdateInvoiceStatus } from "@/feature/invoice/hook/useInvoices";
import { CmvButton, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney, formatPeriod } from "@/shared/util/money.util";

/**
 * Onglet Factures (p6-3), servi aux DEUX rôles depuis #32.
 *
 * Une seule ressource — `GET /invoices` est scopée par le tenant : le coach y lit ce qu'il a émis,
 * l'athlète ce qu'il doit. Ce qui diffère est ce qu'on peut en faire, porté par un booléen plutôt
 * que par un second écran qui recopierait la lecture pour n'en changer que les boutons.
 *
 * `useCapabilities` est lu pour la PRÉSENTATION, jamais pour garder : qui entre est décidé par la
 * table d'onglets et la garde du layout.
 */
export function InvoicesScreen() {
  const { t } = useTranslation();
  const { isCoach } = useCapabilities();
  const { data: invoices, isPending, isError, isRefetching, refetch } = useInvoices();
  const updateStatus = useUpdateInvoiceStatus();

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
          {isCoach ? t("invoice.coach.title") : t("invoice.title")}
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

        {/* Le vide ne dit pas la même chose des deux côtés : au coach qu'il n'a rien émis, à
            l'athlète qu'on ne lui demande rien. */}
        {!isPending && !isError && !hasInvoices ? (
          <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
            <CmvText className="text-cmv-text-hi">
              {isCoach ? t("invoice.coach.empty.title") : t("invoice.empty.title")}
            </CmvText>
            <CmvText className="text-cmv-text-mid text-sm">
              {isCoach ? t("invoice.coach.empty.description") : t("invoice.empty.description")}
            </CmvText>
          </View>
        ) : null}

        {(invoices ?? []).map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice}
            canManage={isCoach}
            busy={updateStatus.isPending}
            onSetStatus={(status) => updateStatus.mutate({ id: invoice.id, status })}
          />
        ))}
      </ScrollView>
    </CmvScreen>
  );
}

type InvoiceCardProps = {
  invoice: InvoiceDto;
  /**
   * Le coach pilote le statut, l'athlète consulte. Un booléen plutôt que le rôle : la carte n'a pas
   * à savoir QUI regarde, seulement ce qui lui est permis.
   */
  canManage: boolean;
  busy: boolean;
  onSetStatus: (status: typeof InvoiceStatus.PAID | typeof InvoiceStatus.PENDING) => void;
};

function InvoiceCard({ invoice, canManage, busy, onSetStatus }: Readonly<InvoiceCardProps>) {
  const { t } = useTranslation();
  const isPaid = invoice.status === InvoiceStatus.PAID;
  // Annulée = terminal (l'API refuse tout retour en 409) : la carte ne propose aucune action, et le
  // montant est barré — plus personne ne doit rien.
  const isCancelled = invoice.status === InvoiceStatus.CANCELLED;
  // L'échéance dépassée se colore aussi (maquette pd-8) : c'est l'information qui appelle une action.
  const isOverdue = resolveInvoiceState(invoice, todayIsoDate()) === InvoiceState.OVERDUE;

  return (
    <View className="gap-2 rounded-lg border border-cmv-border bg-cmv-bg-1 p-4">
      <View className="flex-row items-center justify-between gap-2">
        {/* Le cycle facturé — cœur du lien facture ↔ planification. */}
        <CmvText className="flex-1 text-cmv-text-hi">{invoice.planTitle ?? "—"}</CmvText>
        <InvoiceStatusBadge invoice={invoice} />
      </View>

      <CmvText
        className={
          isCancelled
            ? "font-cmv-display text-2xl text-cmv-text-lo line-through"
            : "font-cmv-display text-2xl text-cmv-text-hi"
        }
      >
        {formatMoney(invoice.amountCents, invoice.currency)}
      </CmvText>

      {/* La facture porte les deux noms : chacun lit celui de l'AUTRE partie. Le coach suit N
          athlètes, l'athlète n'a qu'un coach. */}
      <CmvText className="text-cmv-text-mid text-sm">
        {canManage ? invoice.athleteName : t("invoice.byCoach", { name: invoice.coachName })} ·{" "}
        {t("invoice.periodLabel", { period: formatPeriod(invoice.period) })}
      </CmvText>

      <CmvText className={isOverdue ? "text-cmv-error-on text-xs" : "text-cmv-text-lo text-xs"}>
        {t("invoice.dueLabel", { date: formatDate(invoice.dueDate) })}
        {/* paidAt null tant qu'impayée : on n'affiche la date de règlement que si elle existe. */}
        {isPaid && invoice.paidAt != null
          ? ` · ${t("invoice.paidAtLabel", { date: formatDate(invoice.paidAt.slice(0, 10)) })}`
          : ""}
      </CmvText>

      {invoice.note == null ? null : (
        <CmvText className="text-cmv-text-mid text-sm">{invoice.note}</CmvText>
      )}

      {/* Marquage manuel du règlement — coach seul, et l'API le garde aussi (`@Roles([COACH])`).
          Le paiement réel est externe en MVP : ce bouton déclare, il n'encaisse pas. Réversible,
          parce qu'un paiement posé à tort doit pouvoir se corriger. */}
      {canManage && !isCancelled ? (
        <CmvButton
          label={isPaid ? t("invoice.reopen") : t("invoice.markPaid")}
          onPress={() => onSetStatus(isPaid ? InvoiceStatus.PENDING : InvoiceStatus.PAID)}
          disabled={busy}
        />
      ) : null}

      {/* Justificatif PDF : URL GET signée (TTL court), ouverte par le lecteur du téléphone. */}
      {invoice.documentUrl == null ? null : (
        <Pressable
          onPress={() => {
            const url = invoice.documentUrl;
            if (url != null) void Linking.openURL(url);
          }}
          className="self-start rounded-lg border border-cmv-border px-3 py-2"
        >
          <CmvText className="text-cmv-accent text-sm">{t("invoice.viewDocument")}</CmvText>
        </Pressable>
      )}
    </View>
  );
}
