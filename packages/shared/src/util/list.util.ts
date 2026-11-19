/**
 * `items`, l'élément de rang `from` déplacé au rang `to` — `null` quand rien ne bouge : un rang
 * hors liste, ou un élément déposé sur lui-même.
 *
 * `null` plutôt qu'une copie inchangée (#360) : chaque éditeur qui réordonne une liste — grille,
 * colonnes, paliers, blocs, séances d'une journée — doit NE RIEN ÉCRIRE quand le geste est sans
 * effet, faute de quoi il remonte une modification que le coach n'a pas faite (une notification,
 * pour une journée diffusée). Avec une copie, chacun re-gardait les bornes à sa façon, et les
 * gardes avaient divergé ; le `null` les rassemble ici, et l'appelant ne peut pas l'oublier.
 */
export function movedItem<T>(items: readonly T[], from: number, to: number): T[] | null {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return null;
  }
  // Le retrait AVANT l'insertion : `to` désigne la place dans la liste d'arrivée, où l'élément
  // déplacé ne compte plus parmi ceux qui le précèdent.
  const next = items.filter((_item, index) => index !== from);
  next.splice(to, 0, items[from] as T);
  return next;
}
