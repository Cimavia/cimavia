/**
 * Ce que les mutations partagées demandent au cache des clients. Le `QueryClient` de TanStack
 * Query le satisfait tel quel : `@cmv/shared` n'a pas à dépendre de la bibliothèque pour décrire
 * ce qu'elle en fait (#499, généralisé en #505).
 *
 * Les lectures rendent `unknown` : le cache ne sait pas ce qu'il range, c'est la clé qui le dit,
 * et c'est à l'appelant de nommer le type qu'il y a mis.
 */
export type CacheClient = {
  getQueryData(queryKey: readonly unknown[]): unknown;
  setQueryData(queryKey: readonly unknown[], updater: unknown): unknown;
  invalidateQueries(filters: { queryKey: readonly unknown[] }): unknown;
};
