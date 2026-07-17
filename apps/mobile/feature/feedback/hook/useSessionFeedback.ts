import type { SessionFeedbackDto, UpsertSessionFeedbackInput } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { feedbackKeys, getMyFeedback, upsertMyFeedback } from "@/feature/feedback/api";
import { planKeys, scheduledSessionKeys } from "@/feature/plan/api";

export function useSessionFeedback(sessionId: string) {
  return useQuery<SessionFeedbackDto | null>({
    queryKey: feedbackKeys.detail(sessionId),
    queryFn: () => getMyFeedback(sessionId),
  });
}

/**
 * Écrit le débrief. Débriefer change AUSSI le statut de la séance (DONE) : on invalide donc le
 * détail de la séance et le cycle, sinon le planning continuerait d'afficher « À faire » sur une
 * séance qu'on vient de débriefer.
 */
export function useUpsertFeedback(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertSessionFeedbackInput) => upsertMyFeedback(sessionId, input),
    onSuccess: (feedback) => {
      queryClient.setQueryData(feedbackKeys.detail(sessionId), feedback);
      queryClient.invalidateQueries({ queryKey: scheduledSessionKeys.detail(sessionId) });
      queryClient.invalidateQueries({ queryKey: planKeys.current() });
    },
  });
}
