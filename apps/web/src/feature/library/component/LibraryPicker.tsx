import { type CustomMetric, type ExerciseDto, LibraryScope, searchMatcher } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useExercises, useExerciseTags } from "@/feature/library/hook/useExercises";
import { sharesLibrary, useMyOrganizations } from "@/feature/library/hook/useMyOrganizations";
import { ownerRightText } from "@/feature/library/util/access-text.util";
import { dosageSummary } from "@/feature/library/util/dosage-summary.util";
import { mergeCatalogs } from "@/feature/library/util/metric-catalog.util";
import {
  CmvButton,
  CmvChoiceChips,
  CmvEmptyState,
  CmvTagList,
  CmvTextField,
  CmvToggleChip,
} from "@/shared/component";

// "" = pas de filtre : un tag ne peut pas être vide, la valeur est donc libre de toute collision.
const NO_TAG = "";

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
 * Chaque exercice dit à qui il est, et — partagé — le droit qu'en a le Coach (#606, frame 8) : la
 * Lecture suffit à l'ajouter. Sans entreprise, rien ne lui est partagé : ni propriétaire, ni
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
  const [tag, setTag] = useState(NO_TAG);
  const [shown, setShown] = useState<Shown>({ mine: true, shared: true });
  // `null` tant que les entreprises ne se lisent pas : le propriétaire, que chaque exercice
  // porte, se montre quand même — seules les bascules, qui demandent une portée, attendent.
  const sharing = sharesLibrary(useMyOrganizations().data);
  const scope = sharing === true ? scopeOf(shown) : LibraryScope.ALL;

  const { data: exercises } = useExercises({
    ...(tag === NO_TAG ? {} : { tag }),
    // Sans portée choisie, celle de l'API par défaut — tout ce que le Coach lit — suffit.
    ...(scope === LibraryScope.ALL ? {} : { scope }),
  });
  const { data: tags } = useExerciseTags();

  // Filtrage du titre côté client : la liste d'un coach tient en mémoire, et `searchMatcher` rend
  // les DEUX côtés comparables — taper « echauffement » trouve « Échauffement ».
  const matches = searchMatcher(search);
  const visible = (exercises ?? []).filter((exercise) => matches(exercise.title));

  return (
    <div className="flex w-full flex-col gap-cmv-sm">
      <div className="max-w-md">
        <CmvTextField
          label={t("library.searchLabel")}
          name="pickerSearch"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("library.session.pickerSearch")}
        />
      </div>

      {sharing === true ? <ShownToggles shown={shown} onChange={setShown} /> : null}

      {tags == null || tags.length === 0 ? null : (
        <CmvChoiceChips
          value={tag}
          onChange={setTag}
          options={[
            { value: NO_TAG, label: t("library.filterAllTags") },
            ...tags.map((name) => ({ value: name, label: name })),
          ]}
        />
      )}

      {exercises != null && visible.length === 0 ? (
        <PickerEmpty
          search={search.trim()}
          tag={tag}
          sharedOnly={scope === LibraryScope.SHARED}
          onCreateMissing={onCreateMissing}
          isSaving={isSaving}
        />
      ) : null}

      {/* Une grille et non une colonne : le sélecteur occupe toute la largeur du centre depuis
          qu'il a quitté le rail de droite, et une seule colonne y laisserait un vide énorme. */}
      <div className="grid max-h-[28rem] gap-cmv-sm overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((exercise) => {
          // Les colonnes d'un exercice partagé citent le catalogue de son propriétaire (#605).
          const summary = dosageSummary(
            exercise.blocks,
            mergeCatalogs(customMetrics, exercise.customMetrics),
            t,
            i18n.language,
          );
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onPick(exercise)}
              className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-left transition-colors hover:border-cmv-border-hi hover:bg-cmv-surface-hi"
            >
              <span className="text-cmv-body text-cmv-text-hi">{exercise.title}</span>
              <CmvTagList tags={exercise.tags} />
              {sharing === false ? null : (
                <span className="text-cmv-caption text-cmv-text-lo">
                  {ownerRightText(exercise, t)}
                </span>
              )}
              {summary == null ? null : (
                <span className="text-cmv-caption text-cmv-text-mid">{summary}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type PickerEmptyProps = {
  search: string;
  tag: string;
  sharedOnly: boolean;
  onCreateMissing: (title: string) => void;
  isSaving: boolean;
};

/**
 * Le sélecteur vide, dans l'ordre des onglets de la bibliothèque : recherche, tag, partagés, rien.
 * Seule la recherche vaine propose de créer — et pas parmi les seuls partagés : ce qui manque
 * n'est pas au Coach de le faire (frame 4).
 */
function PickerEmpty({
  search,
  tag,
  sharedOnly,
  onCreateMissing,
  isSaving,
}: Readonly<PickerEmptyProps>) {
  const { t } = useTranslation();
  if (search !== "") {
    return (
      <CmvEmptyState
        title={t("library.noMatch.title", { search })}
        action={
          sharedOnly ? undefined : (
            <CmvButton onClick={() => onCreateMissing(search)} disabled={isSaving}>
              {t("library.noMatch.create", { search })}
            </CmvButton>
          )
        }
      />
    );
  }
  if (tag !== NO_TAG) return <CmvEmptyState title={t("library.noFilterMatch")} />;
  if (sharedOnly) return <CmvEmptyState title={t("library.access.exercise.sharedEmpty")} />;
  return <CmvEmptyState title={t("library.empty.title")} />;
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
