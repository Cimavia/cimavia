import type { ExerciseCategory, ExerciseDto } from "@cmv/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExerciseCard } from "@/feature/library/component/ExerciseCard";
import { EXERCISE_CATEGORIES } from "@/feature/library/constant";
import { useExercises } from "@/feature/library/hook/useExercises";
import {
  CmvButton,
  CmvEmptyState,
  CmvErrorState,
  CmvSegmented,
  CmvTextField,
} from "@/shared/component";

// "ALL" = pas de filtre catégorie (valeur sentinelle locale, jamais envoyée à l'API).
type CategoryFilter = ExerciseCategory | "ALL";

type ExerciseListProps = {
  onCreate: () => void;
  onEdit: (exercise: ExerciseDto) => void;
};

export function ExerciseList({ onCreate, onEdit }: Readonly<ExerciseListProps>) {
  const { t } = useTranslation();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [search, setSearch] = useState("");

  const filters = {
    ...(categoryFilter === "ALL" ? {} : { category: categoryFilter }),
    ...(search.trim() ? { search: search.trim() } : {}),
  };
  const { data: exercises, isPending, isError, refetch } = useExercises(filters);

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
        <CmvSegmented<CategoryFilter>
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[
            { value: "ALL", label: t("library.filterAll") },
            ...EXERCISE_CATEGORIES.map((value) => ({
              value: value as CategoryFilter,
              label: t(`library.category.${value}`),
            })),
          ]}
        />
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

      {exercises?.length === 0 ? (
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
