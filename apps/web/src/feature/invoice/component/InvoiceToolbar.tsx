import { INVOICE_ROW_FILTERS, type InvoiceRowFilter } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvSegmented, type CmvSegmentedOption, CmvTextField } from "@/shared/component";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values invoice.situationFilter: INVOICE_SITUATIONS, ALL

/**
 * La barre d'outils de la facturation (#120, maquette frame 1).
 *
 * Même disposition que celle du tableau de suivi et que celle de la bibliothèque — champ à gauche,
 * segments à droite : deux barres d'outils de la même app doivent se ressembler.
 *
 * Les segments portent leur DÉCOMPTE, ce que les autres barres ne font pas, et c'est ce qui les
 * rend utiles ici : « En retard 2 » répond à la question du coach avant même qu'il ne clique. Les
 * décomptes sont établis sur les lignes NON filtrées — un segment annonce ce qu'il contient, pas
 * ce qui reste après le filtre en cours.
 */

type InvoiceToolbarProps = {
  search: string;
  filter: InvoiceRowFilter;
  counts: Record<InvoiceRowFilter, number>;
  onSearchChange: (search: string) => void;
  onFilterChange: (filter: InvoiceRowFilter) => void;
};

export function InvoiceToolbar({
  search,
  filter,
  counts,
  onSearchChange,
  onFilterChange,
}: Readonly<InvoiceToolbarProps>) {
  const { t } = useTranslation();

  const options: CmvSegmentedOption<InvoiceRowFilter>[] = INVOICE_ROW_FILTERS.map((value) => ({
    value,
    // `n` et non `count` : `count` déclencherait la pluralisation d'i18next, qui irait chercher
    // des variantes `_one`/`_other` que ces libellés n'ont pas.
    label: t(`invoice.situationFilter.${value}`, { n: counts[value] }),
  }));

  return (
    <div className="flex flex-wrap items-end justify-between gap-cmv-lg">
      <div className="w-full max-w-xs">
        <CmvTextField
          label={t("invoice.searchLabel")}
          name="invoiceAthleteSearch"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("invoice.searchPlaceholder")}
        />
      </div>

      <CmvSegmented<InvoiceRowFilter>
        label={t("invoice.situationLabel")}
        options={options}
        value={filter}
        onChange={onFilterChange}
      />
    </div>
  );
}
