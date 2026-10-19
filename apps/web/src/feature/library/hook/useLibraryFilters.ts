import { LibraryScope } from "@cmv/shared";
import { useState } from "react";
import { sharesLibrary, useMyOrganizations } from "@/feature/library/hook/useMyOrganizations";

/**
 * Les filtres communs aux deux onglets de la bibliothèque (#606) : recherche, tags, portée — et les
 * entreprises du Coach, dont dépend la portée. Sans entreprise, rien ne lui est partagé : la portée
 * demandée reste `all` et le filtre ne s'affiche pas (frame 14).
 */
export function useLibraryFilters() {
  const [search, setSearch] = useState("");
  // Les tags choisis : aucun = pas de filtre (#654).
  const [tags, setTags] = useState<readonly string[]>([]);
  const [chosenScope, setChosenScope] = useState<LibraryScope>(LibraryScope.ALL);
  const organizations = useMyOrganizations();
  // Inconnu, le partage attend : `LibraryListState` dit le chargement ou l'erreur.
  const sharing = sharesLibrary(organizations.data) === true;
  const scope = sharing ? chosenScope : LibraryScope.ALL;

  return {
    search: search.trim(),
    tags,
    scope,
    organizations,
    /** Les props de `LibraryToolbar` qui ne dépendent pas de l'onglet. */
    toolbar: {
      search,
      onSearch: setSearch,
      chosenTags: tags,
      onChosenTags: setTags,
      scope: sharing ? chosenScope : null,
      onScope: setChosenScope,
    },
  };
}
