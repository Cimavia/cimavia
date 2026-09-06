import { PLAN_ROW_FILTERS, type PlanRowFilter } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvSegmented, type CmvSegmentedOption, CmvTextField } from "@/shared/component";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values plan.stateFilter: PLAN_ROW_FILTERS

/**
 * La barre d'outils de la liste des planifications (#225, maquette frames 1 et 2).
 *
 * Même disposition que celle de la facturation, du tableau de suivi et de la bibliothèque — champ
 * à gauche, segments à droite : deux barres d'outils de la même app doivent se ressembler.
 *
 * Les segments portent leur DÉCOMPTE, comme ceux de la facturation, et ils comptent des ATHLÈTES
 * et non des cycles : le tableau affiche des athlètes, et « 18 » au-dessus de six lignes ne
 * répondrait à aucune question. Les décomptes sont établis sur les lignes NON filtrées — un
 * segment annonce ce qu'il contient, pas ce qui reste après le filtre en cours.
 *
 * Aucun libellé de tri à droite, contrairement à ce que dessinait la planche : l'ordre se lit dans
 * la colonne d'échéance, qui le trie, et une phrase qui l'annonce ne peut que finir par mentir.
 */

type PlanToolbarProps = {
  search: string;
  filter: PlanRowFilter;
  counts: Record<PlanRowFilter, number>;
  onSearchChange: (search: string) => void;
  onFilterChange: (filter: PlanRowFilter) => void;
};

export function PlanToolbar({
  search,
  filter,
  counts,
  onSearchChange,
  onFilterChange,
}: Readonly<PlanToolbarProps>) {
  const { t } = useTranslation();

  const options: CmvSegmentedOption<PlanRowFilter>[] = PLAN_ROW_FILTERS.map((value) => ({
    value,
    // `n` et non `count` : `count` déclencherait la pluralisation d'i18next, qui irait chercher
    // des variantes `_one`/`_other` que ces libellés n'ont pas.
    label: t(`plan.stateFilter.${value}`, { n: counts[value] }),
  }));

  return (
    <div className="flex flex-wrap items-end justify-between gap-cmv-lg">
      <div className="w-full max-w-xs">
        <CmvTextField
          label={t("plan.searchLabel")}
          name="planAthleteSearch"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("plan.searchPlaceholder")}
        />
      </div>

      <CmvSegmented<PlanRowFilter>
        label={t("plan.stateLabel")}
        options={options}
        value={filter}
        onChange={onFilterChange}
      />
    </div>
  );
}
