import { type ExerciseCategory, type ExerciseDto, Role } from "@cmv/shared";
import { Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExerciseCard } from "@/feature/library/component/ExerciseCard";
import { ExerciseForm } from "@/feature/library/component/ExerciseForm";
import { EXERCISE_CATEGORIES } from "@/feature/library/constant";
import { useExercises } from "@/feature/library/hook/useExercises";
import { CmvButton, CmvEmptyState, CmvSegmented, CmvTabs, CmvTextField } from "@/shared/component";
import { authClient } from "@/shared/lib/auth";

type LibraryTab = "exercises" | "sessions";
// "ALL" = pas de filtre catégorie (valeur sentinelle locale, jamais envoyée à l'API).
type CategoryFilter = ExerciseCategory | "ALL";

export function LibraryScreen() {
  const { t } = useTranslation();
  const { data: session, isPending: isSessionPending } = authClient.useSession();

  const [tab, setTab] = useState<LibraryTab>("exercises");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<ExerciseDto | null>(null);

  const filters = {
    ...(categoryFilter === "ALL" ? {} : { category: categoryFilter }),
    ...(search.trim() ? { search: search.trim() } : {}),
  };
  const { data: exercises, isPending, isError } = useExercises(filters);

  if (isSessionPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cmv-bg-0 text-cmv-text-mid">
        {t("common.loading")}
      </main>
    );
  }
  // Bibliothèque = surface coach uniquement (l'API refuse déjà l'athlète en 403).
  if (session?.user.role !== Role.COACH) {
    return <Navigate to="/" />;
  }

  function openCreate() {
    setEditing(null);
    setPanelOpen(true);
  }

  function openEdit(exercise: ExerciseDto) {
    setEditing(exercise);
    setPanelOpen(true);
  }

  return (
    <main className="min-h-screen bg-cmv-bg-0 p-cmv-2xl">
      <div className="mx-auto flex max-w-5xl flex-col gap-cmv-xl">
        <header className="flex items-start justify-between gap-cmv-lg">
          <div className="flex flex-col gap-cmv-xs">
            <h1 className="font-cmv-display text-cmv-title text-cmv-text-hi">
              {t("library.title")}
            </h1>
            <p className="text-cmv-body text-cmv-text-mid">{t("library.subtitle")}</p>
          </div>
          <CmvButton onClick={openCreate}>{t("library.newExercise")}</CmvButton>
        </header>

        <CmvTabs
          value={tab}
          onChange={setTab}
          tabs={[
            {
              value: "exercises",
              label: t("library.tabs.exercises"),
              ...(exercises ? { count: exercises.length } : {}),
            },
            { value: "sessions", label: t("library.tabs.sessions") },
          ]}
        />

        {tab === "sessions" ? (
          // MOCKED — onglet Séances. À connecter au SessionBuilder (commit 8).
          <CmvEmptyState
            title={t("library.sessions.soonTitle")}
            description={t("library.sessions.soonDescription")}
          />
        ) : (
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
            {isError ? <p className="text-cmv-error">{t("common.error")}</p> : null}

            {exercises?.length === 0 ? (
              <CmvEmptyState
                title={t("library.empty.title")}
                description={t("library.empty.description")}
                action={<CmvButton onClick={openCreate}>{t("library.newExercise")}</CmvButton>}
              />
            ) : null}

            <div className="grid gap-cmv-lg sm:grid-cols-2 lg:grid-cols-3">
              {exercises?.map((exercise) => (
                <ExerciseCard key={exercise.id} exercise={exercise} onSelect={openEdit} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Remonté par `key` : le formulaire se réinitialise à chaque exercice édité. */}
      {panelOpen ? (
        <ExerciseForm
          key={editing?.id ?? "new"}
          open={panelOpen}
          exercise={editing}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </main>
  );
}
