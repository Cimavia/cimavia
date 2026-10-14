import { LibraryScope } from "@cmv/shared";
import { useState } from "react";
import { NO_TAG_FILTER } from "@/feature/library/component/LibraryToolbar";
import { useMyOrganizations } from "@/feature/library/hook/useMyOrganizations";

/**
 * Les filtres communs aux deux onglets de la bibliothèque (#606) : recherche, tag, portée — et les
 * entreprises du Coach, dont dépend la portée. Sans entreprise, rien ne lui est partagé : la portée
 * demandée reste `all` et le filtre ne s'affiche pas (frame 14).
 */
export function useLibraryFilters() {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState(NO_TAG_FILTER);
  const [chosenScope, setScope] = useState<LibraryScope>(LibraryScope.ALL);
  const organizations = useMyOrganizations();
  const sharing = (organizations.data?.length ?? 0) > 0;
  const scope = sharing ? chosenScope : LibraryScope.ALL;

  return {
    search: search.trim(),
    tag,
    scope,
    organizations,
    /** Les props de `LibraryToolbar` qui ne dépendent pas de l'onglet. */
    toolbar: {
      search,
      onSearch: setSearch,
      tag,
      onTag: setTag,
      scope: sharing ? scope : null,
      onScope: setScope,
    },
  };
}
