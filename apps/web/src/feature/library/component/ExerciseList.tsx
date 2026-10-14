import { LibraryScope } from "@cmv/shared";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LibraryEmptyState } from "@/feature/library/component/LibraryEmptyState";
import { LibraryListState } from "@/feature/library/component/LibraryListState";
import { LibraryTable } from "@/feature/library/component/LibraryTable";
import { LibraryToolbar } from "@/feature/library/component/LibraryToolbar";
import { NO_TAG_FILTER } from "@/feature/library/constant";
import {
  useChangeExerciseAccess,
  useExercises,
  useExerciseTags,
} from "@/feature/library/hook/useExercises";
import { useLibraryFilters } from "@/feature/library/hook/useLibraryFilters";
import { CmvButton, CmvEmptyState } from "@/shared/component";

/**
 * L'onglet Exercices (#606, maquette #597, frames 1, 2, 4 et 14). La liste n'ouvre pas de panneau
 * de détail : le constructeur est une PAGE, parce qu'il porte la consigne structurée, les blocs de
 * dosage et l'aperçu athlète — trois choses qu'un tiroir de 480 px ne peut pas montrer côte à côte.
 */
export function ExerciseList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const filters = useLibraryFilters();
  const exercises = useExercises({
    ...(filters.tag === NO_TAG_FILTER ? {} : { tag: filters.tag }),
    ...(filters.search === "" ? {} : { search: filters.search }),
    scope: filters.scope,
  });
  // Les tags existants de tout ce que le Coach lit, pas ceux des exercices affichés : dérivés de la
  // liste filtrée, ils rétréciraient à chaque clic et le filtre deviendrait un aller sans retour.
  const { data: tags } = useExerciseTags();
  const change = useChangeExerciseAccess();

  function open(exerciseId: string) {
    navigate({ to: "/library/exercises/$exerciseId", params: { exerciseId } });
  }

  /**
   * Le vide de DÉPART et le vide de FILTRE ne se ressemblent pas : le premier amorce une
   * bibliothèque neuve, le second constate qu'une recherche ne trouve rien — et propose de créer
   * l'exercice manquant (`libraryEmpty`).
   */
  function emptyState() {
    return (
      <LibraryEmptyState
        search={filters.search}
        tag={filters.tag}
        sharedOnly={filters.scope === LibraryScope.SHARED}
        noMatch={t("library.noMatch.title", { search: filters.search })}
        create={
          <CmvButton
            onClick={() =>
              navigate({ to: "/library/exercises/new", search: { title: filters.search } })
            }
          >
            {t("library.noMatch.create", { search: filters.search })}
          </CmvButton>
        }
        sharedEmpty={t("library.access.exercise.sharedEmpty")}
      >
        <CmvEmptyState
          title={t("library.empty.title")}
          description={t("library.empty.description")}
          action={
            <CmvButton onClick={() => navigate({ to: "/library/exercises/new" })}>
              {t("library.newExercise")}
            </CmvButton>
          }
        />
      </LibraryEmptyState>
    );
  }

  return (
    <>
      <LibraryToolbar
        {...filters.toolbar}
        searchPlaceholder={t("library.searchExercise")}
        tags={tags ?? []}
      />
      <LibraryListState list={exercises} organizations={filters.organizations}>
        {(rows, organizations) =>
          rows.length === 0 ? (
            emptyState()
          ) : (
            <LibraryTable
              // Une autre portée est une autre liste : la sélection ne la traverse pas.
              key={filters.scope}
              rows={rows}
              organizations={organizations}
              copyPrefix="library.access.exercise"
              mutation={change}
              onOpen={(exercise) => open(exercise.id)}
            />
          )
        }
      </LibraryListState>
    </>
  );
}
