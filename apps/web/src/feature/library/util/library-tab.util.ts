/** Les onglets de la bibliothèque. Exercices est celui qu'on ouvre sans rien demander. */
export const LibraryTab = {
  EXERCISES: "exercises",
  SESSIONS: "sessions",
  STRUCTURES: "structures",
} as const;
export type LibraryTab = (typeof LibraryTab)[keyof typeof LibraryTab];

/** Ce que porte l'URL de la bibliothèque : l'onglet, sauf celui par défaut. */
export type LibrarySearch = { tab?: Exclude<LibraryTab, typeof LibraryTab.EXERCISES> };

/**
 * L'onglet tient dans l'URL (#717) : un constructeur ramène à l'onglet d'où il vient, et un F5 le
 * garde. Une valeur inconnue ouvre Exercices plutôt qu'une erreur — c'est une adresse tapée à la
 * main ou un lien ancien.
 *
 * L'objet vide plutôt qu'un `tab: undefined` : sans ça TanStack rend `tab` OBLIGATOIRE à la
 * navigation, et chaque lien vers la bibliothèque devrait en passer un.
 */
export function librarySearchOf(search: Record<string, unknown>): LibrarySearch {
  return search.tab === LibraryTab.SESSIONS || search.tab === LibraryTab.STRUCTURES
    ? { tab: search.tab }
    : {};
}
