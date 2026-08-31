import type { SessionFeedbackDto, UpsertSessionFeedbackInput } from "@cmv/shared";
import { myFeedbackKeys, myPlanKeys } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteFeedbackApi } from "@/feature/feedback/api";

// `null` tant que la séance n'a pas été débriefée : l'absence est un état normal, pas une erreur.
export function useMyFeedback(sessionId: string) {
  return useQuery<SessionFeedbackDto | null>({
    queryKey: myFeedbackKeys.detail(sessionId),
    queryFn: () => athleteFeedbackApi.get(sessionId),
  });
}

/**
 * Écrit le débrief. Débriefer change AUSSI le statut de la séance (`DONE`) : on invalide donc le
 * détail de la séance et le cycle, sinon le planning continuerait d'afficher « À faire » sur une
 * séance qu'on vient de débriefer.
 */
export function useUpsertMyFeedback(sessionId: string, onSaved?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertSessionFeedbackInput) => athleteFeedbackApi.upsert(sessionId, input),
    onSuccess: (feedback) => {
      onSaved?.();
      queryClient.setQueryData(myFeedbackKeys.detail(sessionId), feedback);
      queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: myPlanKeys.current() });
    },
  });
}
