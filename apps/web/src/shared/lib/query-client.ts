import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/shared/lib/api";

/** Un seul nouvel essai sur une lecture qui échoue — une coupure brève n'affiche pas d'erreur. */
const QUERY_RETRY_COUNT = 1;

/**
 * Le client de requêtes du web, avec son écoute GLOBALE des sessions perdues (#336).
 *
 * Sans elle, un 401 n'était traité nulle part : tant que l'onglet gardait le focus, Better Auth ne
 * relisait pas la session — son rafraîchissement est câblé sur `visibilitychange` —, la garde
 * laissait donc passer, chaque lecture affichait une erreur et chaque enregistrement crachait un
 * « Unauthorized » brut.
 *
 * Le 401 ne REDIRIGE pas : il demande seulement à Better Auth de relire la session
 * (`onUnauthorized`). C'est `CmvRoleGate` qui décide ensuite, et qui garde l'écran monté sous une
 * fenêtre de reconnexion — rediriger aurait démonté le constructeur en cours de saisie, soit
 * exactement la perte que le constat reprochait. Une seule source de décision pour les deux
 * chemins qui découvrent la perte : un 401 de l'API, et le retour sur l'onglet.
 *
 * Posé sur les CACHES et non dans `defaultOptions` : un `onError` d'écran remplace celui des
 * options par défaut, alors que celui du cache s'exécute toujours, en plus.
 */
export function createQueryClient(onUnauthorized: () => void): QueryClient {
  const onError = (error: unknown) => {
    if (isUnauthorizedError(error)) onUnauthorized();
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Pas de nouvel essai sur un 401 : la même session sera refusée de la même façon, et
        // l'essai ne ferait que retarder la fenêtre de reconnexion.
        retry: (failureCount, error) =>
          !isUnauthorizedError(error) && failureCount < QUERY_RETRY_COUNT,
      },
    },
  });
}
