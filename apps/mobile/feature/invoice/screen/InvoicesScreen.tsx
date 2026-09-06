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
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { InvoiceDetail } from "@/feature/invoice/component/InvoiceDetail";
import { InvoiceStatusBadge } from "@/feature/invoice/component/InvoiceStatusBadge";
import { useInvoiceDetail } from "@/feature/invoice/hook/useInvoiceDetail";
import { useInvoices } from "@/feature/invoice/hook/useInvoices";
// Le fichier du hook et non le baril de la feature : celui-ci réexporte un écran, et y passer
// rouvrirait le cycle que ce sélecteur vient de fermer.
import { useUnreadByCapability } from "@/feature/notification/hook/useNotifications";
import { CmvCapabilitySwitch, CmvErrorState, CmvScreen, CmvText } from "@/shared/component";
import { OfflineBanner } from "@/shared/component/OfflineBanner";
import { useActingCapability } from "@/shared/hook/useExercisedCapability";
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
  // Le titre EXERCÉ, pas la capacité possédée : un compte qui cumule lit à un titre à la fois.
  const isCoach = useActingCapability() === "coach";
  // Même clé de cache pour tous les appelants : une seule requête, quel que soit le nombre
  // d'écrans qui affichent le sélecteur.
  const { data: unread } = useUnreadByCapability();
  const { data: invoices, isPending, isError, isRefetching, refetch } = useInvoices();
  // La facture ouverte et ses gestes : une seule affaire, et la même pour les deux titres.
  const detail = useInvoiceDetail(invoices);

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

      {/* Le sélecteur à DROITE du titre : il qualifie ce titre — « mes factures, en tant que… » —
          et sous lui il aurait l'air d'un filtre de la liste. Ne rend rien pour un compte
          mono-capacité, auquel cas le titre reprend toute la largeur. */}
      <View className="flex-row items-center justify-between gap-2 px-4 pt-4">
        <CmvText className="shrink font-cmv-display text-cmv-text-hi text-xl">
          {isCoach ? t("invoice.coach.title") : t("invoice.title")}
        </CmvText>
        <CmvCapabilitySwitch unread={unread} />
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
          <InvoiceCard key={invoice.id} invoice={invoice} onOpen={() => detail.open(invoice.id)} />
        ))}
      </ScrollView>

      {/* Monté seulement quand une facture est ouverte : les gestes n'ont alors plus à se garder
          d'une cible absente, et le détail n'a pas de cas « rien à montrer » à porter. */}
      {detail.props == null ? null : <InvoiceDetail {...detail.props} canManage={isCoach} />}
    </CmvScreen>
  );
}

type InvoiceCardProps = {
  invoice: InvoiceDto;
  onOpen: () => void;
};

/**
 * Une facture dans la liste à plat — celle que garde l'ATHLÈTE, qui n'a qu'un coach et donc rien à
 * grouper (#224). Le coach, lui, lit ses factures groupées par athlète.
 *
 * La carte ne porte plus ni la note, ni le justificatif, ni les actions : tout cela vit maintenant
 * dans `InvoiceDetail`, où ça tient. Elle ne garde que ce qui permet de RECONNAÎTRE la facture —
 * son cycle, son montant, son état, sa date — et mène au reste.
 */
function InvoiceCard({ invoice, onOpen }: Readonly<InvoiceCardProps>) {
  const { t } = useTranslation();
  const isPaid = invoice.status === InvoiceStatus.PAID;
  // Annulée = terminal (l'API refuse tout retour en 409) : le montant est barré — plus personne ne
  // doit rien.
  const isCancelled = invoice.status === InvoiceStatus.CANCELLED;
  // L'échéance dépassée se colore aussi (maquette pd-8) : c'est l'information qui appelle une action.
  const isOverdue = resolveInvoiceState(invoice, todayIsoDate()) === InvoiceState.OVERDUE;

  return (
    <Pressable
      onPress={onOpen}
      className="gap-2 rounded-lg border border-cmv-border bg-cmv-bg-1 p-4"
    >
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

      {/* La facture porte les deux noms : chacun lit celui de l'AUTRE partie. */}
      <CmvText className="text-cmv-text-mid text-sm">
        {t("invoice.byCoach", { name: invoice.coachName })} ·{" "}
        {t("invoice.periodLabel", { period: formatPeriod(invoice.period) })}
      </CmvText>

      <CmvText className={isOverdue ? "text-cmv-error-on text-xs" : "text-cmv-text-lo text-xs"}>
        {t("invoice.dueLabel", { date: formatDate(invoice.dueDate) })}
        {/* paidAt null tant qu'impayée : on n'affiche la date de règlement que si elle existe. */}
        {isPaid && invoice.paidAt != null
          ? ` · ${t("invoice.paidAtLabel", { date: formatDate(invoice.paidAt.slice(0, 10)) })}`
          : ""}
      </CmvText>
    </Pressable>
  );
}
