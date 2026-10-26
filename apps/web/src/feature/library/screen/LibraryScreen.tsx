import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ExerciseList } from "@/feature/library/component/ExerciseList";
import { SessionList } from "@/feature/library/component/SessionList";
import { StructureList, type StructureSource } from "@/feature/library/component/StructureList";
import { useExercises } from "@/feature/library/hook/useExercises";
import { useSessions } from "@/feature/library/hook/useSessions";
import { useStructureLibrary } from "@/feature/library/hook/useStructures";
import { LibraryTab, librarySearchOf } from "@/feature/library/util/library-tab.util";
import { CmvAppShell, CmvButton, CmvTabs } from "@/shared/component";

/** « Nouvel exercice », « Nouvelle séance » ou « Nouvelle structure », selon l'onglet. */
const CREATE_LABEL = {
  exercises: "library.newExercise",
  sessions: "library.newSession",
  structures: "library.newStructure",
} as const satisfies Record<LibraryTab, string>;

export function LibraryScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // L'onglet vit dans l'URL (#717) : un constructeur ramène à celui d'où il vient. Lecture non
  // stricte, relue par `librarySearchOf` : `getRouteApi("/library/")` lierait l'écran à l'id de sa
  // route, que `renderInRoute` ne reproduit pas (il monte l'écran sous `/library`).
  const { tab = LibraryTab.EXERCISES } = librarySearchOf(useSearch({ strict: false }));

  // Compteurs d'onglets : totaux (non filtrés). Mêmes clés de cache que les listes → pas de
  // requête supplémentaire pour les séances et les structures ; les exercices non filtrés sont une
  // entrée à part.
  const { data: allExercises } = useExercises({});
  const { data: allSessions } = useSessions();
  const { data: structures } = useStructureLibrary();

  function openTab(next: LibraryTab) {
    navigate({
      to: "/library",
      search: next === LibraryTab.EXERCISES ? {} : { tab: next },
      replace: true,
    });
  }

  // Exercice, séance comme structure : une PAGE, pas un tiroir (#163, #165, #717).
  function openCreate() {
    if (tab === LibraryTab.STRUCTURES) navigate({ to: "/library/structures/new" });
    else if (tab === LibraryTab.SESSIONS) navigate({ to: "/library/sessions/new" });
    else navigate({ to: "/library/exercises/new" });
  }

  function openDuplicate(source: StructureSource) {
    navigate({
      to: "/library/structures/new",
      search: "preset" in source ? { from: source.preset } : { from: source.structureId },
    });
  }

  return (
    <CmvAppShell
      title={t("library.title")}
      subtitle={t("library.subtitle")}
      actions={<CmvButton onClick={openCreate}>{t(CREATE_LABEL[tab])}</CmvButton>}
    >
      <div className="flex flex-col gap-cmv-xl">
        <CmvTabs
          value={tab}
          onChange={openTab}
          tabs={[
            {
              value: LibraryTab.EXERCISES,
              label: t("library.tabs.exercises"),
              ...(allExercises ? { count: allExercises.length } : {}),
            },
            {
              value: LibraryTab.SESSIONS,
              label: t("library.tabs.sessions"),
              ...(allSessions ? { count: allSessions.length } : {}),
            },
            {
              value: LibraryTab.STRUCTURES,
              label: t("library.tabs.structures"),
              // Les prêtes comptent : elles se choisissent dans une séance comme les autres.
              ...(structures
                ? { count: structures.presets.length + structures.structures.length }
                : {}),
            },
          ]}
        />

        {tab === LibraryTab.SESSIONS ? (
          <SessionList
            onCreate={openCreate}
            onEdit={(session) =>
              navigate({
                to: "/library/sessions/$sessionId",
                params: { sessionId: session.id },
              })
            }
          />
        ) : null}
        {tab === LibraryTab.STRUCTURES ? (
          <StructureList
            onCreate={openCreate}
            onEdit={(structure) =>
              navigate({
                to: "/library/structures/$structureId",
                params: { structureId: structure.id },
              })
            }
            onDuplicate={openDuplicate}
          />
        ) : null}
        {tab === LibraryTab.EXERCISES ? <ExerciseList /> : null}
      </div>
    </CmvAppShell>
  );
}
