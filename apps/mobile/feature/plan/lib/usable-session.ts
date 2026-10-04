import { isSignedUrlUsable, myPlanKeys, type ScheduledSessionDto } from "@cmv/shared";
import type { QueryClient } from "@tanstack/react-query";
import { athletePlanApi } from "@/feature/plan/api";

/**
 * La composition d'une séance, À JOUR et avec des URLs de documents RÉELLEMENT signables à
 * l'instant (#95, #307).
 *
 * Le cache suffit quand il remplit les deux conditions ; sinon on recharge.
 *
 * - **À jour** : `knownUpdatedAt` est la dernière écriture que le planning annonce pour la séance.
 *   Une copie du cache qui n'en porte pas la même date date d'avant une retouche du coach. La
 *   comparaison se fait entre deux dates du SERVEUR — l'horloge du téléphone n'y entre pas. Sans
 *   repère (l'appelant n'a que la séance elle-même), on ne compare rien.
 * - **Signable** : `staleTime` vaut exactement le TTL de signature (5 min), et le cache est
 *   persisté une semaine — un démarrage à froid ressort donc des URLs mortes, qu'un téléchargement
 *   ou une ouverture suivrait jusqu'au 403.
 *
 * Lève quand le rechargement échoue : c'est à l'appelant de dire ce que l'échec veut dire pour lui.
 */
export async function usableSession(
  queryClient: QueryClient,
  sessionId: string,
  knownUpdatedAt?: string,
): Promise<ScheduledSessionDto> {
  const queryKey = myPlanKeys.session(sessionId);
  const state = queryClient.getQueryState<ScheduledSessionDto>(queryKey);
  const cached = state?.data;

  if (
    state != null &&
    cached != null &&
    (knownUpdatedAt == null || cached.updatedAt === knownUpdatedAt) &&
    isSignedUrlUsable(state.dataUpdatedAt, Date.now())
  ) {
    return cached;
  }

  return queryClient.fetchQuery<ScheduledSessionDto>({
    queryKey,
    queryFn: () => athletePlanApi.session(sessionId),
    staleTime: 0,
  });
}
