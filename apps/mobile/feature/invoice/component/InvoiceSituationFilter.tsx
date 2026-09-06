import { INVOICE_ROW_FILTERS, type InvoiceRowFilter } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView } from "react-native";
import { CmvText } from "@/shared/component";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// `INVOICE_SITUATIONS, ALL` et non `INVOICE_ROW_FILTERS` : celui-ci est bâti par ÉTALEMENT
// (`["ALL", ...INVOICE_SITUATIONS]`), que le script ne déplie pas — il n'y lirait que « ALL ».
// i18n-values invoice.coach.situationFilter: INVOICE_SITUATIONS, ALL

/**
 * Le filtre de situation, en chips qui DÉFILENT (#224, maquette frame 1).
 *
 * Quatre segments côte à côte ne tiennent pas en largeur sur un téléphone : le web a une barre
 * segmentée, ici c'est un ruban horizontal. Le défilement est le seul choix qui garde les
 * DÉCOMPTES lisibles — « En retard 2 » répond à la question du coach avant même qu'il ne touche.
 *
 * Le décompte est DANS le libellé, et non à côté : la clé l'interpole (« En retard {{n}} »), et une
 * chaîne interpolée ne peut pas porter deux styles. Le coloriser à part demanderait de scinder la
 * clé, donc de diverger d'un libellé que #120 vient de poser.
 */

type InvoiceSituationFilterProps = {
  counts: Record<InvoiceRowFilter, number>;
  filter: InvoiceRowFilter;
  onChange: (filter: InvoiceRowFilter) => void;
};

export function InvoiceSituationFilter({
  counts,
  filter,
  onChange,
}: Readonly<InvoiceSituationFilterProps>) {
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4"
    >
      {INVOICE_ROW_FILTERS.map((value) => {
        const selected = value === filter;
        return (
          <Pressable
            key={value}
            onPress={() => onChange(value)}
            accessibilityState={{ selected }}
            className={`shrink-0 rounded-full border px-4 py-2 ${
              selected
                ? "border-cmv-border-hi bg-cmv-surface-hi"
                : "border-cmv-border bg-cmv-surface"
            }`}
          >
            <CmvText className={`text-xs ${selected ? "text-cmv-text-hi" : "text-cmv-text-mid"}`}>
              {/* `n` et non `count` : `count` déclencherait la pluralisation d'i18next, qui irait
                  chercher des variantes `_one`/`_other` que ces libellés n'ont pas. */}
              {t(`invoice.coach.situationFilter.${value}`, { n: counts[value] })}
            </CmvText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
