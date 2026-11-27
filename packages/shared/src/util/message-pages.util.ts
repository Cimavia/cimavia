import type { CursorPage } from "../dto/cursor-page.schema";
import type { MessageDto } from "../dto/message.schema";

/**
 * Le fil tel que le cache client le tient depuis #77 : les pages chargées, la plus RÉCENTE
 * d'abord — la première demandée —, puis chaque page plus ancienne à mesure qu'on remonte. La
 * forme est celle des requêtes infinies de TanStack, redite ici : `@cmv/shared` n'en dépend pas.
 */
export type MessagePages = {
  pages: readonly CursorPage<MessageDto>[];
  pageParams: readonly unknown[];
};

/**
 * Le fil à afficher, du plus ancien au plus récent : les pages remises dans l'ordre de lecture,
 * chacune l'étant déjà. Fait pour l'option `select` de la requête : l'écran reçoit un fil, et
 * « rien en cache » reste l'`undefined` de la requête, que la fonction ne voit pas.
 *
 * Toutes les règles qui lisent le fil (`lastUnreadIncomingId`, `readByOf`, `incomingCountAfter`)
 * le lisent ainsi, pages bout à bout. Aucune n'a besoin du fil ENTIER : la marque de lecture et le
 * nombre de non-lus viennent de l'API, et ce que la remontée n'a pas encore chargé n'est pas à
 * l'écran.
 */
export function threadOfPages(data: MessagePages): MessageDto[] {
  // De la dernière page (la plus ancienne) à la première. `reduceRight` et non `toReversed` :
  // Hermes, le moteur du mobile, n'est pas garanti sur les méthodes d'ES2023.
  return data.pages.reduceRight<MessageDto[]>((thread, page) => thread.concat(page.items), []);
}

/** Le curseur de la page d'avant, `null` une fois tout le fil chargé. */
export function olderPageCursor(lastPage: CursorPage<MessageDto>): string | null {
  return lastPage.nextCursor;
}

/** Où en est la remontée du fil : les drapeaux de la requête infinie qui la gouvernent. */
export type OlderPageState = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
};

/**
 * La page d'avant peut-elle partir SEULE, parce que le lecteur est arrivé en tête du fil ? Non
 * au début du fil, non pendant qu'une page est en route (deux demandes pour le même curseur), et
 * non après un échec : la relancer à chaque arrivée en tête martèlerait une API en panne. Après
 * un échec, c'est « Réessayer » qui relance, sans passer par ici.
 */
export function shouldLoadOlderPage(state: OlderPageState): boolean {
  return state.hasNextPage && !state.isFetchingNextPage && !state.isFetchNextPageError;
}

/**
 * La page la plus récente RELUE — par le sondage, une invalidation, un retour au premier plan —,
 * recousue sur celle qu'on avait. Elle garde sa frontière basse (`nextCursor`) et absorbe ce qui
 * est arrivé depuis : les pages plus anciennes se relisent alors aux mêmes curseurs, et le fil
 * chargé ne glisse pas.
 *
 * Sans elle, TanStack relit autant de pages qu'il en avait, la première étant « les 50 plus
 * récents » : chaque message arrivé en poussait un hors du bas de la première page, et ainsi de
 * suite jusqu'au plus ancien chargé, qui disparaissait sous les yeux du lecteur remonté.
 *
 * Recousue seulement si la page relue contient encore le plus récent de celle d'avant. Sinon,
 * plus de 50 messages sont arrivés entre-temps (un fil rouvert après une longue absence) : les
 * recoudre laisserait un trou, et la page relue repart seule.
 */
export function refreshNewestPage(
  previous: CursorPage<MessageDto> | undefined,
  fetched: CursorPage<MessageDto>,
): CursorPage<MessageDto> {
  const newest = previous?.items.at(-1);
  if (previous == null || newest == null) return fetched;
  const fetchedIds = new Set(fetched.items.map(({ id }) => id));
  if (!fetchedIds.has(newest.id)) return fetched;
  // Ce que la page relue ne porte plus, ce sont les plus anciens d'avant : ils restent en tête.
  // Les autres sont pris de la relecture, qui a leurs URLs fraîches.
  const kept = previous.items.filter(({ id }) => !fetchedIds.has(id));
  return { items: [...kept, ...fetched.items], nextCursor: previous.nextCursor };
}
