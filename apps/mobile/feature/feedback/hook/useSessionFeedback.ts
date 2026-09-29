import { type FeedbackTracking, feedbackSaveMutation, type SessionFeedbackDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteFeedbackApi, myFeedbackKeys } from "@/feature/feedback/api";
import { keepFeedbackUrls } from "@/shared/lib/signed-url";

export function useSessionFeedback(sessionId: string) {
  return useQuery<SessionFeedbackDto | null>({
    queryKey: myFeedbackKeys.detail(sessionId),
    queryFn: () => athleteFeedbackApi.get(sessionId),
    // Même raison que côté coach : un rechargement ne doit pas relancer les lecteurs.
    structuralSharing: keepFeedbackUrls,
  });
}

/**
 * Écrit le débrief. Ce que l'écriture fait au cache — séance, cycle, liste coach, refus — est
 * commun aux deux clients : voir `feedbackSaveMutation`. Le refus y pèse plus qu'au web : la séance
 * en cache est persistée ici, et tenue pour fraîche cinq minutes.
 */
export function useUpsertFeedback(
  sessionId: string,
  onSaved?: (sent: FeedbackTracking | undefined) => void,
) {
  return useMutation(
    feedbackSaveMutation(useQueryClient(), athleteFeedbackApi, sessionId, onSaved),
  );
}
