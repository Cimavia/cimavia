import { type CustomMetric, type ExerciseDto, LibraryScope, searchMatcher } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LibraryEmptyState } from "@/feature/library/component/LibraryEmptyState";
import {
  HeadCell,
  LIBRARY_ROW,
  NoValue,
  TagsCell,
  TitleCell,
} from "@/feature/library/component/LibraryTableCells";
import { LibraryFilterBar } from "@/feature/library/component/LibraryToolbar";
import { useExercises, useExerciseTags } from "@/feature/library/hook/useExercises";
import { sharesLibrary, useMyOrganizations } from "@/feature/library/hook/useMyOrganizations";
import { ownerRightText } from "@/feature/library/util/access-text.util";
import { dosageSummary } from "@/feature/library/util/dosage-summary.util";
import { mergeCatalogs } from "@/feature/library/util/metric-catalog.util";
import { CMV_TABLE, CmvButton, CmvEmptyState, CmvToggleChip } from "@/shared/component";
import { cn } from "@/shared/util/cn.util";

/** Ce que le sélecteur propose : les exercices du Coach, ceux qu'on lui partage — ou les deux. */
type Shown = { mine: boolean; shared: boolean };

function scopeOf({ mine, shared }: Shown): LibraryScope {
  if (mine && shared) return LibraryScope.ALL;
  return mine ? LibraryScope.MINE : LibraryScope.SHARED;
}

type LibraryPickerProps = {
  customMetrics: readonly CustomMetric[];
  onPick: (exercise: ExerciseDto) => void;
  /** Le titre cherché, rogné. C'est à l'écran de quitter la séance sans la perdre (#303). */
  onCreateMissing: (title: string) => void;
  /** Ferme la création le temps d'un enregistrement : un double clic créerait deux séances. */
  isSaving: boolean;
};

/**
 * La bibliothèque dans laquelle piocher, avec la MÊME phrase de dosage que la composition : le
 * coach doit reconnaître ce qu'il ajoute avant de l'ajouter.
 *
 * Un tableau, comme la bibliothèque (#653, frame 8) : un clic sur la ligne ajoute l'exercice.
 * Chaque exercice dit à qui il est, et — partagé — le droit qu'en a le Coach (#606) : la Lecture
 * suffit à l'ajouter. Sans entreprise, rien ne lui est partagé : ni colonne Propriétaire, ni
 * bascule (frame 14).
 *
 * La recherche sans résultat propose de créer l'exercice manquant en reprenant le texte tapé
 * comme titre. Le sélecteur ne navigue pas lui-même : quitter la séance la jetterait. Il remonte
 * le titre à l'écran, qui enregistre la séance avant de partir et sait y revenir (#303).
 */
export function LibraryPicker({
  customMetrics,
  onPick,
  onCreateMissing,
  isSaving,
}: Readonly<LibraryPickerProps>) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [chosenTags, setChosenTags] = useState<readonly string[]>([]);
  const [shown, setShown] = useState<Shown>({ mine: true, shared: true });
  // `null` tant que les entreprises ne se lisent pas : le propriétaire, que chaque exercice
  // porte, se montre quand même — seules les bascules, qui demandent une portée, attendent.
  const sharing = sharesLibrary(useMyOrganizations().data);
  const scope = sharing === true ? scopeOf(shown) : LibraryScope.ALL;

  const { data: exercises } = useExercises({
    ...(chosenTags.length === 0 ? {} : { tags: chosenTags }),
    scope,
  });
  const { data: tags } = useExerciseTags();

  // Filtrage du titre côté client : la liste d'un coach tient en mémoire, et `searchMatcher` rend
  // les DEUX côtés comparables — taper « echauffement » trouve « Échauffement ».
  const matches = searchMatcher(search);
  const visible = (exercises ?? []).filter((exercise) => matches(exercise.title));

  return (
    <div className="flex w-full flex-col gap-cmv-sm">
      {/* La même ligne que les onglets de la bibliothèque (#653) ; seule la provenance diffère. */}
      <LibraryFilterBar
        name="pickerSearch"
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t("library.session.pickerSearch")}
        tags={tags ?? []}
        chosenTags={chosenTags}
        onChosenTags={setChosenTags}
      >
        {sharing === true ? <ShownToggles shown={shown} onChange={setShown} /> : null}
      </LibraryFilterBar>

      {exercises != null && visible.length === 0 ? (
        <PickerEmpty
          search={search.trim()}
          tags={chosenTags}
          sharedOnly={scope === LibraryScope.SHARED}
          onCreateMissing={onCreateMissing}
          isSaving={isSaving}
        />
      ) : null}

      {visible.length === 0 ? null : (
        // Le cadre arrondit, le conteneur défile : `CMV_TABLE.frame` coupe ce qui déborde, et `cn`
        // ne résout pas les conflits de classes — un `overflow-auto` posé à côté ne l'emporterait pas.
        <div className={CMV_TABLE.frame}>
          <div className="max-h-[28rem] overflow-auto">
            <table className={CMV_TABLE.table}>
              {/* L'en-tête reste visible pendant le défilement : chaque cellule porte son fond
                  et son filet (`CMV_TABLE.stickyHeadCell`). */}
              <thead>
                <tr>
                  <HeadCell sticky label={t("library.table.title")} />
                  <HeadCell sticky label={t("library.table.tags")} />
                  {sharing === false ? null : <HeadCell sticky label={t("library.table.owner")} />}
                  <HeadCell sticky label={t("library.table.dosage")} />
                </tr>
              </thead>
              <tbody>
                {visible.map((exercise) => {
                  // Les colonnes d'un exercice partagé citent le catalogue de son propriétaire (#605).
                  const summary = dosageSummary(
                    exercise.blocks,
                    mergeCatalogs(customMetrics, exercise.customMetrics),
                    t,
                    i18n.language,
                  );
                  return (
                    <tr key={exercise.id} className={LIBRARY_ROW}>
                      <TitleCell title={exercise.title} onClick={() => onPick(exercise)} />
                      <TagsCell tags={exercise.tags} />
                      {sharing === false ? null : (
                        <td className={cn(CMV_TABLE.cell, "text-cmv-text-mid")}>
                          {ownerRightText(exercise, t)}
                        </td>
                      )}
                      <td className={cn(CMV_TABLE.cell, "text-cmv-caption text-cmv-text-mid")}>
                        {summary ?? <NoValue />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

type PickerEmptyProps = {
  search: string;
  tags: readonly string[];
  sharedOnly: boolean;
  onCreateMissing: (title: string) => void;
  isSaving: boolean;
};

/** Le sélecteur vide, selon la même règle que les onglets de la bibliothèque (`libraryEmpty`). */
function PickerEmpty({
  search,
  tags,
  sharedOnly,
  onCreateMissing,
  isSaving,
}: Readonly<PickerEmptyProps>) {
  const { t } = useTranslation();
  return (
    <LibraryEmptyState
      search={search}
      tags={tags}
      sharedOnly={sharedOnly}
      noMatch={t("library.noMatch.title", { search })}
      create={
        <CmvButton onClick={() => onCreateMissing(search)} disabled={isSaving}>
          {t("library.noMatch.create", { search })}
        </CmvButton>
      }
      sharedEmpty={t("library.access.exercise.sharedEmpty")}
    >
      <CmvEmptyState title={t("library.empty.title")} />
    </LibraryEmptyState>
  );
}

type ShownTogglesProps = { shown: Shown; onChange: (shown: Shown) => void };

/**
 * « Les miens · Partagés », actives toutes deux par défaut (frame 8). La dernière active ne se
 * désactive pas : un sélecteur qui ne propose rien n'a pas de sens.
 */
function ShownToggles({ shown, onChange }: Readonly<ShownTogglesProps>) {
  const { t } = useTranslation();
  const locked = t("library.picker.lastShown");
  return (
    <fieldset className="flex flex-wrap gap-cmv-xs">
      <legend className="sr-only">{t("library.picker.shown")}</legend>
      <CmvToggleChip
        pressed={shown.mine}
        locked={shown.mine && !shown.shared ? locked : undefined}
        onToggle={() => onChange({ ...shown, mine: !shown.mine })}
      >
        {t("library.scope.mine")}
      </CmvToggleChip>
      <CmvToggleChip
        pressed={shown.shared}
        locked={shown.shared && !shown.mine ? locked : undefined}
        onToggle={() => onChange({ ...shown, shared: !shown.shared })}
      >
        {t("library.picker.shared")}
      </CmvToggleChip>
    </fieldset>
  );
}
