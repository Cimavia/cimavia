/**
 * Ce que dit une liste de la bibliothèque quand elle n'a rien à montrer — onglet ou sélecteur.
 * `canCreate` : la recherche vaine propose de créer ce qu'elle cherchait.
 */
export type LibraryEmpty =
  | { kind: "noMatch"; canCreate: boolean }
  | { kind: "noFilterMatch" }
  | { kind: "sharedEmpty" }
  | { kind: "empty" };

/**
 * Le vide, dans l'ordre des filtres : la recherche, puis le tag, puis la portée (#606). Le tag
 * avant la portée : « rien n'est partagé avec toi » serait faux s'il ne manquait que des éléments
 * partagés PORTANT ce tag. Parmi les seuls partagés, la recherche vaine ne propose pas de créer :
 * ce qui manque n'est pas au Coach de le faire (frame 4).
 */
export function libraryEmpty(view: {
  search: string;
  tagged: boolean;
  sharedOnly: boolean;
}): LibraryEmpty {
  if (view.search !== "") return { kind: "noMatch", canCreate: !view.sharedOnly };
  if (view.tagged) return { kind: "noFilterMatch" };
  return view.sharedOnly ? { kind: "sharedEmpty" } : { kind: "empty" };
}
