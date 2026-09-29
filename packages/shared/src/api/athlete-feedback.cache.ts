import type {
  FeedbackTracking,
  SessionFeedbackDto,
  UpsertSessionFeedbackInput,
} from "../dto/feedback.schema";
import type { ScheduledSessionDto } from "../dto/plan.schema";
import { withSentTracking } from "../util/session-tracking.util";
import { type AthleteFeedbackApi, myFeedbackKeys } from "./athlete-feedback.api";
import { myPlanKeys } from "./athlete-plan.api";
import { ApiError } from "./client";
import { coachFeedbackKeys } from "./coach-feedback.api";

/**
 * Ce que l'écriture du débrief demande au cache. Le `QueryClient` de TanStack Query le satisfait
 * tel quel : `@cmv/shared` n'a pas à dépendre de la bibliothèque pour décrire ce qu'elle en fait.
 */
export type FeedbackCache = {
  setQueryData(queryKey: readonly unknown[], updater: unknown): unknown;
  invalidateQueries(filters: { queryKey: readonly unknown[] }): unknown;
};

/**
 * L'enregistrement du débrief et ce qu'il fait au cache, communs aux deux clients — les options
 * de leur `useMutation`, telles quelles. Écrit deux fois, il divergeait déjà : le mobile
 * n'invalidait pas la liste coach, le web ne relisait pas la séance sur un refus.
 *
 * Au SUCCÈS, dans cet ordre :
 * 1. la séance en cache prend le suivi envoyé (#346, #499) — sitôt le local effacé, c'est elle que
 *    les écrans affichent, et elle porterait sinon le décompte d'avant l'envoi jusqu'à sa relecture ;
 * 2. `onSaved` reçoit ce qui est PARTI, pour que l'écran n'efface pas une coche posée pendant
 *    l'envoi (#499) ;
 * 3. le débrief est rangé, et la séance relue avec le cycle : débriefer la passe en `DONE`, et le
 *    planning afficherait sinon « À faire » sur une séance qu'on vient de débriefer. La liste COACH
 *    aussi, dès qu'un compte cumule les deux capacités (#14) — sans effet pour un athlète pur.
 *
 * Un REFUS (400) relit la séance, et c'est la seule panne qui le fait. Le serveur refuse un suivi
 * qui cite un exercice absent de la séance (#311) ; l'écran filtre ces coches avant l'envoi, mais
 * d'après la séance EN CACHE. Si le coach vient d'en retirer un exercice, le filtre ne le sait pas
 * encore : la relire laisse passer l'envoi suivant (#490, #499). Le suivi local n'est pas touché.
 */
export function feedbackSaveMutation(
  cache: FeedbackCache,
  api: Pick<AthleteFeedbackApi, "upsert">,
  sessionId: string,
  onSaved?: (sent: FeedbackTracking | undefined) => void,
) {
  return {
    mutationFn: (input: UpsertSessionFeedbackInput) => api.upsert(sessionId, input),
    onSuccess: (feedback: SessionFeedbackDto, input: UpsertSessionFeedbackInput) => {
      const sent = input.tracking;
      if (sent != null) {
        cache.setQueryData(
          myPlanKeys.session(sessionId),
          (session: ScheduledSessionDto | undefined) =>
            session == null ? session : withSentTracking(session, sent),
        );
      }
      onSaved?.(sent);
      cache.setQueryData(myFeedbackKeys.detail(sessionId), feedback);
      cache.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      cache.invalidateQueries({ queryKey: myPlanKeys.visible() });
      cache.invalidateQueries({ queryKey: coachFeedbackKeys.all });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 400) {
        cache.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      }
    },
  };
}
