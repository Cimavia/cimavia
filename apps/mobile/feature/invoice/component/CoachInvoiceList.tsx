import type { InvoiceAthleteRow as InvoiceAthleteRowModel, InvoiceDto } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { InvoiceAthleteRow } from "@/feature/invoice/component/InvoiceAthleteRow";
import { CmvText } from "@/shared/component";

/**
 * La liste des athlètes facturés, et l'athlète déplié (#224).
 *
 * UN SEUL déplié à la fois : la question posée à cet écran est « qui me doit quelque chose », et
 * tout ouvrir la reposerait à zéro. L'état vit ici, au plus près de ce qu'il gouverne — l'écran
 * n'a pas à connaître un réglage d'affichage qui ne le regarde pas.
 */

type CoachInvoiceListProps = {
  /** Les lignes RETENUES, déjà filtrées et triées. */
  rows: readonly InvoiceAthleteRowModel<InvoiceDto>[];
  onOpenInvoice: (invoiceId: string) => void;
};

export function CoachInvoiceList({ rows, onOpenInvoice }: Readonly<CoachInvoiceListProps>) {
  const { t } = useTranslation();
  const [expandedAthleteId, setExpandedAthleteId] = useState<string | null>(null);

  /**
   * Aucun athlète ne correspond au filtre — ce n'est PAS « aucune facture émise ». Les confondre
   * enverrait le coach chercher un cycle à diffuser alors qu'il lui suffit de revenir à « Tous ».
   */
  if (rows.length === 0) {
    return (
      <View className="gap-2 rounded-lg border border-cmv-border border-dashed p-6">
        <CmvText className="text-cmv-text-hi">{t("invoice.coach.noMatch.title")}</CmvText>
        <CmvText className="text-cmv-text-mid text-sm">
          {t("invoice.coach.noMatch.description")}
        </CmvText>
      </View>
    );
  }

  return (
    <>
      {rows.map((row) => (
        <InvoiceAthleteRow
          key={row.athleteId}
          row={row}
          expanded={row.athleteId === expandedAthleteId}
          // Re-toucher la ligne ouverte la referme : c'est le geste attendu d'un déplié.
          onToggle={() =>
            setExpandedAthleteId((current) => (current === row.athleteId ? null : row.athleteId))
          }
          onOpenInvoice={onOpenInvoice}
        />
      ))}
    </>
  );
}
