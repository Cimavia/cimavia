import type { SessionFeedbackDto, UpsertSessionFeedbackInput } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteFeedbackApi, myFeedbackKeys } from "@/feature/feedback/api";
import { myPlanKeys } from "@/feature/plan/api";

export function useSessionFeedback(sessionId: string) {
  return useQuery<SessionFeedbackDto | null>({
    queryKey: myFeedbackKeys.detail(sessionId),
    queryFn: () => athleteFeedbackApi.get(sessionId),
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
    mutationFn: (input: UpsertSessionFeedbackInput) => athleteFeedbackApi.upsert(sessionId, input),
    onSuccess: (feedback) => {
      queryClient.setQueryData(myFeedbackKeys.detail(sessionId), feedback);
      queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: myPlanKeys.current() });
    },
  });
}
