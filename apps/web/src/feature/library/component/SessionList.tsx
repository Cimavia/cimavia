import { LibraryScope, type SessionDto, searchMatcher, sessionTags } from "@cmv/shared";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LibraryEmptyState } from "@/feature/library/component/LibraryEmptyState";
import { LibraryListState } from "@/feature/library/component/LibraryListState";
import { LibraryTable } from "@/feature/library/component/LibraryTable";
import { LibraryToolbar, NO_TAG_FILTER } from "@/feature/library/component/LibraryToolbar";
import { useLibraryFilters } from "@/feature/library/hook/useLibraryFilters";
import { useChangeSessionAccess, useSessions } from "@/feature/library/hook/useSessions";
import { CmvButton, CmvEmptyState } from "@/shared/component";

type SessionListProps = {
  onCreate: () => void;
  onEdit: (session: SessionDto) => void;
};

/**
 * L'onglet Séances (#606, maquette #597, frame 3). Contrairement aux exercices, recherche et tags
 * se filtrent ici, côté client : `/sessions` ne prend que la portée, et les tags d'une séance ne
 * sont que ceux de ses exercices (`sessionTags`) — rien que le serveur stocke.
 */
export function SessionList({ onCreate, onEdit }: Readonly<SessionListProps>) {
  const { t } = useTranslation();
  const filters = useLibraryFilters();
  // Toutes les séances lisibles — déjà en cache pour le compteur de l'onglet — portent les tags
  // proposés : ni le filtre ni la portée ne les font rétrécir ou clignoter.
  const all = useSessions(LibraryScope.ALL);
  const sessions = useSessions(filters.scope);
  const change = useChangeSessionAccess();

  const tags = useMemo(() => {
    const known = new Set((all.data ?? []).flatMap((session) => sessionTags(session.exercises)));
    // Le tag choisi reste proposé s'il sort de la liste (relecture) : un filtre actif sans
    // pastille ne se déferait plus.
    if (filters.tag !== NO_TAG_FILTER) known.add(filters.tag);
    return [...known].sort((a, b) => a.localeCompare(b));
  }, [all.data, filters.tag]);

  function visible(list: readonly SessionDto[]) {
    const matches = searchMatcher(filters.search);
    return list
      .map((session) => ({ ...session, tags: sessionTags(session.exercises) }))
      .filter(
        (row) =>
          (filters.tag === NO_TAG_FILTER || row.tags.includes(filters.tag)) && matches(row.title),
      );
  }

  /** Même ordre que les exercices ; une séance ne se crée pas depuis une recherche vaine. */
  function emptyState() {
    return (
      <LibraryEmptyState
        search={filters.search}
        tag={filters.tag}
        sharedOnly={filters.scope === LibraryScope.SHARED}
        noMatch={t("library.session.noMatch", { search: filters.search })}
        sharedEmpty={t("library.access.session.sharedEmpty")}
      >
        <CmvEmptyState
          title={t("library.session.listEmpty.title")}
          description={t("library.session.listEmpty.description")}
          action={<CmvButton onClick={onCreate}>{t("library.newSession")}</CmvButton>}
        />
      </LibraryEmptyState>
    );
  }

  return (
    <>
      <LibraryToolbar
        {...filters.toolbar}
        searchPlaceholder={t("library.searchSession")}
        tags={tags}
      />
      <LibraryListState list={sessions} organizations={filters.organizations}>
        {(list, organizations) => {
          const rows = visible(list);
          return rows.length === 0 ? (
            emptyState()
          ) : (
            <LibraryTable
              // Une autre portée est une autre liste : la sélection ne la traverse pas.
              key={filters.scope}
              rows={rows}
              organizations={organizations}
              copyPrefix="library.access.session"
              mutation={change}
              onOpen={onEdit}
              extra={{
                label: t("library.table.exercises"),
                cell: (session) => session.exercises.length,
              }}
            />
          );
        }}
      </LibraryListState>
    </>
  );
}
