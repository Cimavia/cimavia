import { comparableText, type ExerciseDto } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CmvTagList, CmvTextField } from "@/shared/component";

type ExercisePickerProps = {
  exercises: readonly ExerciseDto[];
  onPick: (exercise: ExerciseDto) => void;
  /** Espace de clés i18n — `library.session` ou `plan.session`. */
  labelPrefix: string;
  /**
   * Champ de recherche. Utile dans le builder de bibliothèque, où l'on compose une séance de zéro
   * face au catalogue entier ; superflu dans le panneau de planification, ouvert au-dessus d'une
   * séance déjà largement composée.
   */
  searchable?: boolean;
};

// La bibliothèque dans laquelle piocher : un clic ajoute l'exercice à la composition.
export function ExercisePicker({
  exercises,
  onPick,
  labelPrefix,
  searchable = false,
}: Readonly<ExercisePickerProps>) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  // `comparableText` des DEUX côtés : le coach tape « echauffement » et doit trouver
  // « Échauffement ». Exiger l'accent ferait échouer la recherche sur exactement les titres que le
  // clavier rend pénibles à écrire, sans que rien à l'écran n'explique la liste vide.
  const needle = comparableText(search);
  const pickable =
    needle === ""
      ? exercises
      : exercises.filter((exercise) => comparableText(exercise.title).includes(needle));

  return (
    <aside className="flex w-full flex-col gap-cmv-sm lg:w-72">
      <span className="text-cmv-caption text-cmv-text-mid">{t(`${labelPrefix}.pickerTitle`)}</span>

      {searchable ? (
        <CmvTextField
          label={t("library.searchLabel")}
          name="pickerSearch"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("library.searchExercise")}
        />
      ) : null}

      <div className="flex max-h-96 flex-col gap-cmv-xs overflow-y-auto">
        {pickable.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            onClick={() => onPick(exercise)}
            className="flex items-center justify-between gap-cmv-sm rounded-cmv-md border border-cmv-border bg-cmv-surface px-cmv-md py-cmv-sm text-left transition-colors hover:border-cmv-border-hi hover:bg-cmv-surface-hi"
          >
            <span className="truncate text-cmv-body text-cmv-text-hi">{exercise.title}</span>
            <CmvTagList tags={exercise.tags} />
          </button>
        ))}
      </div>
    </aside>
  );
}
