import { ATHLETE_ROW_FILTERS, type AthleteRowFilter } from "@cmv/shared";
import { useTranslation } from "react-i18next";
import { CmvSegmented, type CmvSegmentedOption, CmvTextField } from "@/shared/component";

// Valeurs attendues derrière les clés i18n assemblées de ce fichier — lues par
// `pnpm check:i18n`, qui vérifie qu'elles existent toutes au catalogue.
// i18n-values dashboard.table.filter: ATHLETE_ROW_FILTERS

/**
 * La barre d'outils du tableau de suivi (#123, maquette pd-4).
 *
 * Deux commandes, là où la maquette en prévoit trois : la recherche par nom et les filtres d'état
 * de cycle. Le sélecteur « Trier : activité récente » n'existe pas — l'activité d'un athlète n'est
 * mesurable par aucune donnée que cet écran charge (une séance faite SANS débrief n'apparaît dans
 * aucune liste, cf. #113), et un ORDRE faux est pire qu'une colonne absente : rien à l'écran ne le
 * signale. La liste est rangée par nom, ce que `visibleAthleteRows` garantit.
 *
 * Même disposition que la barre de la bibliothèque (`ExerciseList`) : champ à gauche, segments à
 * droite. Deux barres d'outils de la même app doivent se ressembler.
 */

type AthleteTrackingToolbarProps = {
  search: string;
  filter: AthleteRowFilter;
  /**
   * `false` quand la liste des cycles n'a pas pu être lue : les deux filtres portent sur le cycle,
   * et `AthleteRow.plan` vaut alors `null` pour TOUT LE MONDE — « Sans plan » annoncerait l'écurie
   * entière. On ne les propose pas plutôt que de les proposer faux. Même règle que le lien
   * « Créer un cycle » de la colonne Planification.
   */
  canFilterByPlan: boolean;
  onSearchChange: (search: string) => void;
  onFilterChange: (filter: AthleteRowFilter) => void;
};

export function AthleteTrackingToolbar({
  search,
  filter,
  canFilterByPlan,
  onSearchChange,
  onFilterChange,
}: Readonly<AthleteTrackingToolbarProps>) {
  const { t } = useTranslation();

  const options: CmvSegmentedOption<AthleteRowFilter>[] = ATHLETE_ROW_FILTERS.map((value) => ({
    value,
    label: t(`dashboard.table.filter.${value}`),
  }));

  return (
    <div className="flex flex-wrap items-end justify-between gap-cmv-lg">
      <div className="w-full max-w-xs">
        <CmvTextField
          label={t("dashboard.table.searchLabel")}
          name="athleteSearch"
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t("dashboard.table.searchPlaceholder")}
        />
      </div>

      {canFilterByPlan ? (
        <CmvSegmented<AthleteRowFilter>
          options={options}
          value={filter}
          onChange={onFilterChange}
        />
      ) : null}
    </div>
  );
}
