import type { ExerciseDto } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExerciseCard } from "@/feature/library/component/ExerciseCard";
import { useExercises, useExerciseTags } from "@/feature/library/hook/useExercises";
import {
  CmvButton,
  CmvChoiceChips,
  CmvEmptyState,
  CmvErrorState,
  CmvTextField,
} from "@/shared/component";

// "" = pas de filtre. Un tag ne peut pas être vide (`exerciseTagSchema` impose min 1), la valeur
// est donc libre de toute collision — pas besoin d'une sentinelle qui pourrait être un vrai tag.
const NO_TAG_FILTER = "";

type ExerciseListProps = {
  onCreate: () => void;
  onEdit: (exercise: ExerciseDto) => void;
};

export function ExerciseList({ onCreate, onEdit }: Readonly<ExerciseListProps>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tagFilter, setTagFilter] = useState(NO_TAG_FILTER);
  const [search, setSearch] = useState("");

  const filters = {
    ...(tagFilter === NO_TAG_FILTER ? {} : { tag: tagFilter }),
    ...(search.trim() ? { search: search.trim() } : {}),
  };
  const { data: exercises, isPending, isError, refetch } = useExercises(filters);
  // Tous les tags du coach, pas ceux des exercices affichés : dérivés de la liste filtrée, ils
  // rétréciraient à chaque clic et le filtre deviendrait un aller sans retour.
  const { data: tags } = useExerciseTags();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-cmv-lg">
        <div className="w-full max-w-xs">
          <CmvTextField
            label={t("library.searchLabel")}
            name="search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("library.searchExercise")}
          />
        </div>
        {/* Aucun tag chez le coach : pas de filtre à un seul bouton « Tous », qui ne filtrerait rien. */}
        {tags == null || tags.length === 0 ? null : (
          <CmvChoiceChips
            value={tagFilter}
            onChange={setTagFilter}
            options={[
              { value: NO_TAG_FILTER, label: t("library.filterAllTags") },
              ...tags.map((tag) => ({ value: tag, label: tag })),
            ]}
          />
        )}
      </div>

      {isPending ? <p className="text-cmv-text-mid">{t("common.loading")}</p> : null}
      {isError ? (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => refetch()}
        />
      ) : null}

      {/* Le vide de DÉPART et le vide de FILTRE ne se ressemblent pas : le premier amorce une
          bibliothèque neuve, le second constate qu'une recherche ne trouve rien alors que la
          bibliothèque est pleine — et propose de créer l'exercice manquant. */}
      {exercises?.length === 0 && search.trim() !== "" ? (
        <CmvEmptyState
          title={t("library.noMatch.title", { search: search.trim() })}
          action={
            <CmvButton
              onClick={() =>
                navigate({ to: "/library/exercises/new", search: { title: search.trim() } })
              }
            >
              {t("library.noMatch.create", { search: search.trim() })}
            </CmvButton>
          }
        />
      ) : null}

      {exercises?.length === 0 && search.trim() === "" ? (
        <CmvEmptyState
          title={t("library.empty.title")}
          description={t("library.empty.description")}
          action={<CmvButton onClick={onCreate}>{t("library.newExercise")}</CmvButton>}
        />
      ) : null}

      <div className="grid gap-cmv-lg sm:grid-cols-2 lg:grid-cols-3">
        {exercises?.map((exercise) => (
          <ExerciseCard key={exercise.id} exercise={exercise} onSelect={onEdit} />
        ))}
      </div>
    </>
  );
}
