import { shouldLoadOlderPage } from "@cmv/shared";
import { useCallback, useState } from "react";
import type { useMessages } from "@/feature/message/hook/useConversation";

type ThreadQuery = Pick<
  ReturnType<typeof useMessages>,
  "fetchNextPage" | "hasNextPage" | "isFetchingNextPage"
>;

/** La remontée du fil telle que la liste l'affiche et la pilote (#77). */
export type OlderMessages = {
  loading: boolean;
  /** La dernière page demandée n'est pas arrivée. Plus rien ne part seul : c'est `retry`. */
  failed: boolean;
  /** Le lecteur est arrivé en tête du fil. */
  loadMore: () => void;
  retry: () => void;
};

/**
 * La remontée du fil (#77) : le lecteur qui arrive en tête fait charger la page d'avant. Ce qui
 * l'arrête — début du fil, page en route, échec — est `shouldLoadOlderPage`, la même règle qu'au
 * web.
 *
 * L'échec est retenu ICI, et non lu de la requête : un sondage réussi efface l'erreur de TanStack,
 * mais ne recharge pas la page d'avant, et la liste ne rappelle `onEndReached` qu'une fois par
 * longueur de contenu. Le lecteur resté en tête n'aurait plus ni bouton, ni page. Seul
 * « Réessayer » le lève.
 *
 * Rien à retenir de la position, contrairement au web : la liste inversée est ancrée au bas, et
 * la page d'avant s'ajoute au bout opposé.
 */
export function useOlderMessages(query: ThreadQuery): OlderMessages {
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const [failed, setFailed] = useState(false);

  const retry = useCallback(() => {
    setFailed(false);
    void fetchNextPage().then(({ isError }) => setFailed(isError));
  }, [fetchNextPage]);

  const loadMore = useCallback(() => {
    if (shouldLoadOlderPage({ hasNextPage, isFetchingNextPage, isFetchNextPageError: failed })) {
      retry();
    }
  }, [hasNextPage, isFetchingNextPage, failed, retry]);

  return { loading: isFetchingNextPage, failed, loadMore, retry };
}
