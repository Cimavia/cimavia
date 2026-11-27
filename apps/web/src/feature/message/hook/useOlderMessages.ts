import { shouldLoadOlderPage } from "@cmv/shared";
import { type RefCallback, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { useThreadMessages } from "@/feature/message/hook/useMessages";
import { useWhenInView } from "@/shared/hook/useWhenInView";

type ThreadQuery = Pick<
  ReturnType<typeof useThreadMessages>,
  "data" | "fetchNextPage" | "hasNextPage" | "isFetchingNextPage"
>;

export type OlderMessages = {
  /** Le repère posé en tête du fil : quand il entre à l'écran, la page d'avant se charge. */
  sentinelRef: RefCallback<Element>;
  loading: boolean;
  /** La dernière page demandée n'est pas arrivée. Plus rien ne part seul : c'est `retry`. */
  failed: boolean;
  retry: () => void;
};

/**
 * La remontée du fil (#77) : le lecteur qui arrive en tête fait charger la page d'avant, et reste
 * sur ce qu'il lisait pendant qu'elle s'ajoute au-dessus (`holdPosition`).
 *
 * Elle se déclenche au REPÈRE et non au défilement, et le repère est observé à neuf à chaque
 * nouvelle tête du fil : celui qui reste à l'écran après une page — un fil de messages courts — en
 * redemande une, sans attendre un geste qui ne viendra pas.
 *
 * L'échec est retenu ICI, et non lu de la requête : un sondage réussi efface l'erreur de TanStack,
 * mais ne recharge pas la page d'avant — le lecteur resté en tête n'aurait plus ni bouton, ni
 * page. Seul « Réessayer » le lève.
 *
 * La position se rétablit quand le PREMIER message change — la seule chose qu'une page d'avant
 * modifie, la première page relue gardant sa frontière (`refreshNewestPage`) —, avant que le
 * navigateur ne peigne.
 */
export function useOlderMessages(
  query: ThreadQuery,
  holdPosition: () => () => void,
): OlderMessages {
  const restore = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const firstId = query.data?.[0]?.id ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `firstId` est un déclencheur, pas une donnée lue — il change quand une page s'ajoute en tête.
  useLayoutEffect(() => {
    restore.current?.();
    restore.current = null;
  }, [firstId]);

  const load = useCallback(() => {
    setFailed(false);
    restore.current = holdPosition();
    void fetchNextPage().then(({ isError }) => {
      if (!isError) return;
      // Rien ne s'est ajouté : la position retenue ne vaut plus pour la page qui viendra.
      restore.current = null;
      setFailed(true);
    });
  }, [fetchNextPage, holdPosition]);

  const sentinelRef = useWhenInView(() => {
    if (shouldLoadOlderPage({ hasNextPage, isFetchingNextPage, isFetchNextPageError: failed })) {
      load();
    }
  }, firstId);

  return { sentinelRef, loading: isFetchingNextPage, failed, retry: load };
}
