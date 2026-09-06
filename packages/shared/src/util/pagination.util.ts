/**
 * Le découpage en pages d'un historique déplié — celui d'un athlète, quel que soit ce qu'il
 * contient.
 *
 * Extrait d'`invoice-row.util.ts` (#120), où il était déjà générique mais nommé d'après les
 * factures : la liste des cycles pagine son historique de la même façon, à la même taille, et
 * recopier vingt lignes pour changer un mot serait exactement la duplication que le seuil Sonar
 * mesure. `pageOfInvoices` reste exporté et inchangé pour ses appelants.
 */

/**
 * Cinq lignes par page (maquettes de la facturation puis des planifications) : de quoi couvrir ce
 * qui appelle un geste sans faire défiler l'écran entier quand un athlète cumule des années.
 */
export const HISTORY_PAGE_SIZE = 5;

export type Page<T> = {
  items: T[];
  /** Page effectivement rendue, 1-based et BORNÉE : une demande hors bornes est ramenée dedans. */
  page: number;
  /** Toujours ≥ 1 : une liste vide a une page vide, pas zéro page. */
  pageCount: number;
  /** Rangs 1-based du premier et du dernier élément — « 6–10 sur 14 ». `0` sur une liste vide. */
  from: number;
  to: number;
  total: number;
};

/**
 * La tranche à afficher. Borne la page plutôt que de rendre une liste vide : supprimer le dernier
 * élément d'une page 3 ne doit pas laisser le lecteur devant un tableau vide sans savoir pourquoi.
 */
export function pageOf<T>(
  items: readonly T[],
  page: number,
  size: number = HISTORY_PAGE_SIZE,
): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(Math.trunc(page), 1), pageCount);
  const start = (current - 1) * size;
  const shown = items.slice(start, start + size);

  return {
    items: shown,
    page: current,
    pageCount,
    from: shown.length === 0 ? 0 : start + 1,
    to: start + shown.length,
    total,
  };
}
