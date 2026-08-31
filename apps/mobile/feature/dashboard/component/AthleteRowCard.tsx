import { type AthleteRow, INVOICE_STATE_BADGE, initialsOf } from "@cmv/shared";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvBadge, CmvText } from "@/shared/component";
import { useAthleteLabel } from "@/shared/hook/useAthleteLabel";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values invoice.status: pending, paid, overdue, cancelled

type AthleteRowCardProps = {
  row: AthleteRow;
};

/**
 * Un athlète dans la liste du tableau de bord.
 *
 * Ce qu'on montre est ce qui ATTEND une réponse du coach — débriefs et messages non lus, état de la
 * dernière facture. Pas de « dernière activité » : la colonne a été écartée du web en #113 faute de
 * donnée fiable (une séance faite SANS débrief n'apparaît dans aucune liste), et la reproduire ici
 * la rendrait fausse deux fois.
 *
 * Pas de colonne « Planification » non plus, contrairement au web : elle exigerait `GET /plans`,
 * une surface coach que le mobile n'a pas — et le builder reste web-only (#20). `AthleteRow.plan`
 * vaut donc `null` ici, ce que `buildAthleteRows` tolère colonne par colonne.
 *
 * La pastille d'identité est en fond NEUTRE : colorer par personne demanderait une palette
 * décorative que `@cmv/tokens` n'a pas — ses familles sont des ÉTATS (arbitrage #37).
 *
 * La ligne mène à la fiche (#31). Le web ouvre la sienne dans un tiroir depuis un bouton « Fiche » ;
 * sur mobile c'est un écran, et toucher la ligne est le geste attendu — un bouton dans une ligne
 * de 40 px serait une cible manquée une fois sur trois.
 */
export function AthleteRowCard({ row }: Readonly<AthleteRowCardProps>) {
  const { t } = useTranslation();
  const athleteLabel = useAthleteLabel();
  const invoiceBadge = row.invoiceState == null ? null : INVOICE_STATE_BADGE[row.invoiceState];

  return (
    <Pressable
      onPress={() => router.push(`/athlete/${row.athleteId}`)}
      className="flex-row items-center gap-3 rounded-lg border border-cmv-border bg-cmv-surface p-3"
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
        {/* `null` = liste indisponible → « — ». `0` = tout est lu. Les deux ne disent pas la même
            chose, et un compteur muet ne dirait ni l'un ni l'autre. */}
        <CmvText className="text-cmv-text-lo text-xs">
          {t("dashboard.row.pending", {
            feedbacks: row.unreadFeedbacks ?? "—",
            messages: row.unreadMessages ?? "—",
          })}
        </CmvText>
      </View>

      {invoiceBadge == null ? null : (
        <CmvBadge label={t(invoiceBadge.labelKey)} variant={invoiceBadge.variant} />
      )}
    </Pressable>
  );
}
