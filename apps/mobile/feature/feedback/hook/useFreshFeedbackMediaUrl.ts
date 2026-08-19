import { isSignedUrlUsable, type SessionFeedbackDto } from "@cmv/shared";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";

/**
 * Donne une URL de média de débrief réellement ouvrable, en re-signant quand celle du cache ne
 * l'est plus.
 *
 * POURQUOI ce détour. Les URLs de lecture sont signées 5 min (`SIGNED_URL_TTL_SECONDS`) et le
 * `staleTime` de l'app vaut exactement autant — or « périmé » ne veut PAS dire « redemandé » :
 * TanStack ne refetche que sur un déclencheur (montage, retour au premier plan, retour réseau).
 * Un coach qui reste six minutes sur un débrief n'en produit aucun, et le cache étant persisté
 * sept jours, un démarrage à froid ressort des URLs signées la semaine passée. Ouvrir sans
 * vérifier enverrait l'utilisateur sur la réponse 403 du storage, en XML brut.
 *
 * La messagerie n'en a pas besoin : son fil sonde toutes les 10 s.
 *
 * `null` en retour = rafraîchissement impossible (hors réseau, API en panne). L'appelant ne doit
 * PAS ouvrir : mieux vaut un message clair qu'une page d'erreur du storage.
 */
export function useFreshFeedbackMediaUrl(queryKey: QueryKey) {
  const queryClient = useQueryClient();

  return async (mediaId: string, cachedUrl: string): Promise<string | null> => {
    const cached = queryClient.getQueryState<SessionFeedbackDto | null>(queryKey);
    if (cached != null && isSignedUrlUsable(cached.dataUpdatedAt, Date.now())) return cachedUrl;

    await queryClient.refetchQueries({ queryKey, exact: true });

    // `refetchQueries` ne rejette pas sur échec de requête : c'est `dataUpdatedAt`, qui n'a alors
    // pas bougé, qui le dit. Une seule vérification couvre donc « refetch raté » et « URL trop
    // vieille », sans inspecter le statut d'erreur.
    const refreshed = queryClient.getQueryState<SessionFeedbackDto | null>(queryKey);
    if (refreshed == null || !isSignedUrlUsable(refreshed.dataUpdatedAt, Date.now())) return null;

    return refreshed.data?.media.find((item) => item.id === mediaId)?.url ?? null;
  };
}
