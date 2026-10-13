import {
  isSignedUrlUsable,
  myPlanKeys,
  type ScheduledSessionDto,
  type ScheduledSessionSummaryDto,
} from "@cmv/shared";
import type { QueryClient } from "@tanstack/react-query";
import { athletePlanApi } from "@/feature/plan/api";

/** Ce que le planning annonce d'une séance, et que sa copie en cache doit porter à l'identique. */
export type SessionMark = Pick<ScheduledSessionSummaryDto, "updatedAt" | "status">;

/**
 * La copie en cache est-elle la séance TELLE QUE le planning l'annonce ? Deux dates du SERVEUR se
 * comparent — l'horloge du téléphone n'y entre pas.
 *
 * - `updatedAt` : une copie qui n'en porte pas la même date date d'avant une retouche du coach.
 * - `status` : le débrief passe la séance en DONE sans faire avancer `updatedAt` (#604), qui reste
 *   la version citée par le coach. Sans lui, un appareil qui n'a pas débriefé garderait la séance
 *   « planifiée » — et proposerait, hors ligne, de la débriefer encore.
 */
export function isCurrentCopy(cached: ScheduledSessionDto, known: SessionMark): boolean {
  return cached.updatedAt === known.updatedAt && cached.status === known.status;
}

/**
 * La composition d'une séance, À JOUR et avec des URLs de documents RÉELLEMENT signables à
 * l'instant (#95, #307).
 *
 * Le cache suffit quand il remplit les deux conditions ; sinon on recharge.
 *
 * - **À jour** : `known` est ce que le planning annonce de la séance (`isCurrentCopy`). Sans
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
  known?: SessionMark,
): Promise<ScheduledSessionDto> {
  const queryKey = myPlanKeys.session(sessionId);
  const state = queryClient.getQueryState<ScheduledSessionDto>(queryKey);
  const cached = state?.data;

  if (
    state != null &&
    cached != null &&
    (known == null || isCurrentCopy(cached, known)) &&
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
