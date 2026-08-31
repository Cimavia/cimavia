import { type CustomMetric, comparableText, type ExerciseDto } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useExercises, useExerciseTags } from "@/feature/library/hook/useExercises";
import { dosageSummary } from "@/feature/library/util/dosage-summary.util";
import {
  CmvButton,
  CmvChoiceChips,
  CmvEmptyState,
  CmvTagList,
  CmvTextField,
} from "@/shared/component";

// "" = pas de filtre : un tag ne peut pas être vide, la valeur est donc libre de toute collision.
const NO_TAG = "";

type LibraryPickerProps = {
  customMetrics: readonly CustomMetric[];
  onPick: (exercise: ExerciseDto) => void;
};

/**
 * La bibliothèque dans laquelle piocher, avec la MÊME phrase de dosage que la composition : le
 * coach doit reconnaître ce qu'il ajoute avant de l'ajouter.
 *
 * La recherche sans résultat propose de créer l'exercice manquant en reprenant le texte tapé
 * comme titre — et le fait sans perdre la séance en cours, puisqu'elle est déjà enregistrée ou
 * que l'ouverture se fait dans un nouvel onglet.
 */
export function LibraryPicker({ customMetrics, onPick }: Readonly<LibraryPickerProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState(NO_TAG);

  const { data: exercises } = useExercises(tag === NO_TAG ? {} : { tag });
  const { data: tags } = useExerciseTags();

  // Filtrage du titre côté client : la liste d'un coach tient en mémoire, et `comparableText` des
  // DEUX côtés permet de taper « echauffement » pour trouver « Échauffement ».
  const needle = comparableText(search);
  const visible = (exercises ?? []).filter(
    (exercise) => needle === "" || comparableText(exercise.title).includes(needle),
  );

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

      {visible.length === 0 && search.trim() !== "" ? (
        <CmvEmptyState
          title={t("library.noMatch.title", { search: search.trim() })}
          action={
            <CmvButton
              onClick={() =>
                navigate({
                  to: "/library/exercises/new",
                  search: { title: search.trim() },
                })
              }
            >
              {t("library.noMatch.create", { search: search.trim() })}
            </CmvButton>
          }
        />
      ) : null}

      {/* Une grille et non une colonne : le sélecteur occupe toute la largeur du centre depuis
          qu'il a quitté le rail de droite, et une seule colonne y laisserait un vide énorme. */}
      <div className="grid max-h-[28rem] gap-cmv-sm overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((exercise) => {
          const summary = dosageSummary(exercise.blocks, customMetrics, t);
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => onPick(exercise)}
              className="flex flex-col gap-cmv-xs rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-left transition-colors hover:border-cmv-border-hi hover:bg-cmv-surface-hi"
            >
              <span className="text-cmv-body text-cmv-text-hi">{exercise.title}</span>
              <CmvTagList tags={exercise.tags} />
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
