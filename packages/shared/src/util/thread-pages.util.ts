import type { MessageApi } from "../api/message.api";
import type { TrainingCapability } from "../capability";
import type { MessagePageDto } from "../dto/message.schema";
import { type MessagePages, olderPageCursor, threadOfPages } from "./message-pages.util";
import type { SignedUrlKeeper } from "./signed-url-keeper.util";

/**
 * Au-delà, une page d'avant se relit même quand ses URLs valent encore : un message effacé (un
 * compte supprimé quitte les fils de groupe) ou une pièce jointe retirée doivent finir par se voir.
 */
export const OLDER_PAGE_MAX_AGE_MS = 5 * 60_000;

/**
 * Une page d'avant, lue à `readAtMs`, peut-elle être rendue telle quelle à une relecture du fil ?
 * Oui si elle est récente ET si chacun de ses médias porte l'URL que la table garde comme
 * ouvrable : une URL qui expire fait relire sa page, et c'est ainsi que `useFreshMediaUrl`, qui
 * relit la requête, obtient sa re-signature.
 *
 * Lue à une date inconnue — un cache restauré au démarrage, une page jamais lue par cette app —,
 * elle se relit. Une date dans le futur aussi : l'horloge a reculé (#867), l'âge ne dit plus rien.
 */
export function isOlderPageFresh(
  page: MessagePageDto,
  readAtMs: number | undefined,
  keeper: SignedUrlKeeper,
  nowMs: number,
): boolean {
  if (readAtMs == null) return false;
  const age = nowMs - readAtMs;
  if (age < 0 || age >= OLDER_PAGE_MAX_AGE_MS) return false;
  return page.items.every(
    (message) => message.media == null || keeper.usableUrl(message.id, nowMs) === message.media.url,
  );
}

type ThreadReader = Pick<MessageApi, "getMessagePage" | "getMessagesSince">;

/**
 * Les options de la requête infinie du fil (#77), pour le web et le mobile — chacun y ajoute son
 * sondage et son partage structurel. UNE par app, comme la table des URLs dont elle dépend : elle
 * retient quand chaque page d'avant a été lue.
 *
 * Toute relecture — le sondage, une invalidation, un retour au premier plan — repasse par
 * `queryFn`, une page à la fois, comme TanStack relit une requête infinie :
 * - la plus RÉCENTE se relit depuis sa frontière (`getMessagesSince`) : en entier, URLs et
 *   effacements compris, avec ce qui est arrivé depuis. Elle garde son curseur, et les pages
 *   d'avant se relisent aux mêmes : le fil chargé ne glisse pas sous le lecteur remonté ;
 * - une page d'AVANT déjà en cache et encore fraîche (`isOlderPageFresh`) est rendue telle quelle,
 *   sans requête. Relues toutes les 10 s, elles feraient grimper le compteur de l'acteur avec la
 *   remontée — 300 requêtes par minute, toutes routes et tous appareils confondus (#782).
 *
 * `cached` lit le cache de la requête, qu'une relecture laisse en place jusqu'à son terme.
 */
export function createThreadPages(keeper: SignedUrlKeeper, now: () => number) {
  const readAt = new Map<string, number>();

  return function threadPagesOptions(
    api: ThreadReader,
    conversationId: string,
    as: TrainingCapability | null,
    cached: () => MessagePages | undefined,
  ) {
    const newestPage = (data: MessagePages | undefined) => {
      const since = data?.pages[0]?.nextCursor ?? null;
      if (since == null) return api.getMessagePage(conversationId, null, as);
      return api.getMessagesSince(conversationId, since, as);
    };

    const olderPage = async (data: MessagePages | undefined, cursor: string) => {
      // Le titre exercé en fait partie : le même fil, lu sous l'autre titre, est une autre requête.
      const key = `${conversationId}|${as ?? ""}|${cursor}`;
      const page = data?.pages[data.pageParams.indexOf(cursor)];
      if (page != null && isOlderPageFresh(page, readAt.get(key), keeper, now())) return page;
      const fetched = await api.getMessagePage(conversationId, cursor, as);
      readAt.set(key, now());
      return fetched;
    };

    return {
      queryFn: ({ pageParam }: { pageParam: string | null }): Promise<MessagePageDto> =>
        pageParam == null ? newestPage(cached()) : olderPage(cached(), pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: olderPageCursor,
      select: threadOfPages,
    };
  };
}

/** Ce que `fetchNextPage` a rendu, en ce qu'en lit la remontée. */
export type OlderPageResult = {
  data: readonly { id: string }[] | undefined;
  hasNextPage: boolean;
  isFetchNextPageError: boolean;
};

/**
 * Ce qu'est devenue la page d'avant demandée quand le fil avait `firstIdBefore` en tête :
 * - `failed` : elle a échoué ;
 * - `loaded` : la tête a changé, ou le fil est entier ;
 * - `interrupted` : ni l'un ni l'autre. Une relecture lancée pendant qu'elle était en route
 *   (l'invalidation d'un envoi, `refetchQueries`) l'a annulée sans erreur, et rien d'autre ne la
 *   relancera — le repère est resté à l'écran, la liste a déjà dit qu'elle était au bout.
 *
 * `isFetchNextPageError` et non `isError` : un sondage raté plus tôt laisse la requête en erreur,
 * ce qui ne dit rien de la page d'avant.
 */
export function olderPageOutcome(
  firstIdBefore: string | null,
  result: OlderPageResult,
): "loaded" | "failed" | "interrupted" {
  if (result.isFetchNextPageError) return "failed";
  const firstId = result.data?.[0]?.id ?? null;
  if (!result.hasNextPage || firstId !== firstIdBefore) return "loaded";
  return "interrupted";
}
