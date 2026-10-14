import { LibraryScope } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LibraryTable } from "@/feature/library/component/LibraryTable";
import { LibraryToolbar, NO_TAG_FILTER } from "@/feature/library/component/LibraryToolbar";
import {
  useChangeExerciseAccess,
  useExercises,
  useExerciseTags,
} from "@/feature/library/hook/useExercises";
import { useMyOrganizations } from "@/feature/library/hook/useMyOrganizations";
import { CmvButton, CmvEmptyState, CmvErrorState } from "@/shared/component";

/**
 * L'onglet Exercices (#606, maquette #597, frames 1, 2, 4 et 14). La liste n'ouvre pas de panneau
 * de détail : le constructeur est une PAGE, parce qu'il porte la consigne structurée, les blocs de
 * dosage et l'aperçu athlète — trois choses qu'un tiroir de 480 px ne peut pas montrer côte à côte.
 */
export function ExerciseList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tagFilter, setTagFilter] = useState(NO_TAG_FILTER);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<LibraryScope>(LibraryScope.ALL);
  const trimmed = search.trim();

  // Sans entreprise, la bibliothèque n'a rien du partage : il faut donc SAVOIR avant d'afficher.
  // Une lecture ratée n'est pas « aucune entreprise » (règle dure n°5) : elle se dit en erreur.
  const organizations = useMyOrganizations();
  const sharing = (organizations.data?.length ?? 0) > 0;
  const exercises = useExercises({
    ...(tagFilter === NO_TAG_FILTER ? {} : { tag: tagFilter }),
    ...(trimmed === "" ? {} : { search: trimmed }),
    ...(sharing ? { scope } : {}),
  });
  // Les tags existants de tout ce que le Coach lit, pas ceux des exercices affichés : dérivés de la
  // liste filtrée, ils rétréciraient à chaque clic et le filtre deviendrait un aller sans retour.
  const { data: tags } = useExerciseTags();
  const change = useChangeExerciseAccess();

  function open(exerciseId: string) {
    navigate({ to: "/library/exercises/$exerciseId", params: { exerciseId } });
  }

  function body() {
    if (exercises.isError || organizations.isError) {
      return (
        <CmvErrorState
          title={t("common.errorTitle")}
          description={t("common.errorDescription")}
          retryLabel={t("common.retry")}
          onRetry={() => {
            if (exercises.isError) exercises.refetch();
            if (organizations.isError) organizations.refetch();
          }}
        />
      );
    }
    if (exercises.data == null || organizations.data == null) {
      return <p className="text-cmv-text-mid">{t("common.loading")}</p>;
    }
    if (exercises.data.length === 0) return emptyState();
    return (
      <LibraryTable
        // Une autre portée est une autre liste : la sélection ne la traverse pas.
        key={scope}
        rows={exercises.data}
        organizations={organizations.data}
        copyPrefix="library.access.exercise"
        mutation={change}
        onOpen={(exercise) => open(exercise.id)}
      />
    );
  }

  /**
   * Le vide de DÉPART et le vide de FILTRE ne se ressemblent pas : le premier amorce une
   * bibliothèque neuve, le second constate qu'une recherche ne trouve rien — et propose de créer
   * l'exercice manquant. « Partagés avec moi » n'appelle aucune création, recherche comprise : ce
   * qui manque n'est pas au Coach de le faire (frame 4).
   */
  function emptyState() {
    const sharedOnly = sharing && scope === LibraryScope.SHARED;
    if (trimmed !== "") {
      return (
        <CmvEmptyState
          title={t("library.noMatch.title", { search: trimmed })}
          action={
            sharedOnly ? undefined : (
              <CmvButton
                onClick={() =>
                  navigate({ to: "/library/exercises/new", search: { title: trimmed } })
                }
              >
                {t("library.noMatch.create", { search: trimmed })}
              </CmvButton>
            )
          }
        />
      );
    }
    if (sharedOnly) {
      return <CmvEmptyState title={t("library.access.exercise.sharedEmpty")} />;
    }
    if (tagFilter !== NO_TAG_FILTER) {
      return <CmvEmptyState title={t("library.noFilterMatch")} />;
    }
    return (
      <CmvEmptyState
        title={t("library.empty.title")}
        description={t("library.empty.description")}
        action={
          <CmvButton onClick={() => navigate({ to: "/library/exercises/new" })}>
            {t("library.newExercise")}
          </CmvButton>
        }
      />
    );
  }

  return (
    <>
      <LibraryToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={t("library.searchExercise")}
        tags={tags ?? []}
        tag={tagFilter}
        onTag={setTagFilter}
        scope={sharing ? scope : null}
        onScope={setScope}
      />
      {body()}
    </>
  );
}
