import type { FeedbackTracking, SessionFeedbackDto } from "@cmv/shared";
import { feedbackSaveMutation, myFeedbackKeys } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteFeedbackApi } from "@/feature/feedback/api";
import { keepFeedbackUrls } from "@/shared/lib/signed-url";

// `null` tant que la séance n'a pas été débriefée : l'absence est un état normal, pas une erreur.
export function useMyFeedback(sessionId: string) {
  return useQuery<SessionFeedbackDto | null>({
    queryKey: myFeedbackKeys.detail(sessionId),
    queryFn: () => athleteFeedbackApi.get(sessionId),
    // Même raison que côté coach : un rechargement ne doit pas relancer les lecteurs.
    structuralSharing: keepFeedbackUrls,
  });
}

/**
 * Écrit le débrief. Ce que l'écriture fait au cache — séance, cycle, liste coach, refus — est
 * commun aux deux clients : voir `feedbackSaveMutation`.
 */
export function useUpsertMyFeedback(
  sessionId: string,
  onSaved?: (sent: FeedbackTracking | undefined) => void,
) {
  return useMutation(
    feedbackSaveMutation(useQueryClient(), athleteFeedbackApi, sessionId, onSaved),
  );
}
