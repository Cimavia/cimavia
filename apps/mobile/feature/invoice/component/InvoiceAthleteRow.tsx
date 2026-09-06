import {
  INVOICE_SITUATION_STATE,
  INVOICE_STATE_BADGE,
  type InvoiceAthleteRow as InvoiceAthleteRowModel,
  type InvoiceDto,
  type InvoiceRowSubtitle,
  initialsOf,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { InvoiceHistoryList } from "@/feature/invoice/component/InvoiceHistoryList";
import { CmvBadge, CmvText } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";
import { formatDate } from "@/shared/util/date.util";
import { formatMoney } from "@/shared/util/money.util";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values invoice.coach.situation: INVOICE_SITUATIONS
// i18n-values invoice.coach.rowSubtitle: OVERDUE_SINCE, NEXT_DUE, LAST_PAID

/**
 * Un athlète FACTURÉ dans la liste du coach (#224, maquette frames 1 et 2).
 *
 * Ce que la reprise change : on ne lit plus des factures, on lit des ATHLÈTES. Le coach ne se
 * demande pas « quelles factures sont en retard » mais « qui me doit quelque chose » — la liste
 * plate lui laissait recomposer de tête qu'un même athlète en avait trois.
 *
 * La ligne se DÉPLIE sur son historique, elle ne mène pas à un écran : l'empiler entre la liste et
 * le détail d'une facture ferait trois écrans pour lire une note, et perdrait la vue d'ensemble à
 * chaque athlète consulté. Un seul déplié à la fois — la question posée ici est « qui », et tout
 * ouvrir la reposerait à zéro.
 *
 * La pastille d'identité est en fond NEUTRE : colorer par personne demanderait une palette
 * décorative que `@cmv/tokens` n'a pas — ses familles sont des ÉTATS (arbitrage #37).
 */

type InvoiceAthleteRowProps = {
  row: InvoiceAthleteRowModel<InvoiceDto>;
  expanded: boolean;
  onToggle: () => void;
  onOpenInvoice: (invoiceId: string) => void;
};

export function InvoiceAthleteRow({
  row,
  expanded,
  onToggle,
  onOpenInvoice,
}: Readonly<InvoiceAthleteRowProps>) {
  const { t } = useTranslation();
  // « (moi) » se déduit de la session : un compte auto-coaché apparaît dans sa propre facturation.
  const athleteLabel = useAthleteLabel();
  const isOverdue = row.situation === "OVERDUE";

  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityState={{ expanded }}
        className={`flex-row items-center gap-3 border border-cmv-border bg-cmv-surface p-3 ${
          expanded ? "rounded-t-lg" : "rounded-lg"
        }`}
      >
        <View className="h-9 w-9 items-center justify-center rounded-md bg-cmv-surface-hi">
          <CmvText className="font-cmv-display text-cmv-text-mid text-xs">
            {initialsOf(row.athleteName)}
          </CmvText>
        </View>

        <View className="flex-1 gap-1">
          <CmvText className="text-cmv-text-hi" numberOfLines={1}>
            {athleteLabel(row.athleteId, row.athleteName)}
          </CmvText>
          <View className="flex-row items-center gap-2">
            <CmvBadge
              variant={INVOICE_STATE_BADGE[INVOICE_SITUATION_STATE[row.situation]].variant}
              label={t(`invoice.coach.situation.${row.situation}`, { n: row.count })}
            />
            <Subtitle subtitle={row.subtitle} />
          </View>
        </View>

        {/* Rien de dû se rend « — », jamais « 0 € » : un zéro se lit comme un montant, et il n'y en
            a pas. La teinte suit la SITUATION et non le nombre de factures — même règle que les
            pastilles, décidée sur la maquette. */}
        <CmvText
          className={`font-cmv-display ${isOverdue ? "text-cmv-error-on" : "text-cmv-text-hi"}`}
        >
          {row.amountDueCents == null
            ? "—"
            : formatMoney(row.amountDueCents, row.invoices[0]?.currency ?? "EUR")}
        </CmvText>

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={cmvColors.text.lo}
        />
      </Pressable>

      {expanded ? (
        <InvoiceHistoryList invoices={row.invoices} onOpenInvoice={onOpenInvoice} />
      ) : null}
    </View>
  );
}

/**
 * Le sous-titre d'une ligne. `@cmv/shared` rend un MOTIF et sa donnée ; c'est ici que le motif
 * devient une phrase — sans quoi elle serait du français figé dans un paquet partagé, qui ne
 * parlerait jamais anglais.
 *
 * `null` = rien de vrai à dire (aucun règlement, échéance illisible). On n'écrit alors rien plutôt
 * qu'une phrase creuse.
 */
function Subtitle({ subtitle }: Readonly<{ subtitle: InvoiceRowSubtitle | null }>) {
  const { t } = useTranslation();
  if (subtitle == null) return null;

  const line =
    subtitle.kind === "OVERDUE_SINCE"
      ? t("invoice.coach.rowSubtitle.OVERDUE_SINCE", { n: subtitle.days })
      : t(`invoice.coach.rowSubtitle.${subtitle.kind}`, { date: formatDate(subtitle.date) });

  return (
    <CmvText className="shrink text-cmv-text-lo text-xs" numberOfLines={1}>
      {line}
    </CmvText>
  );
}
