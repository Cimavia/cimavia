import type { SessionFeedbackDto, UpsertSessionFeedbackInput } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteFeedbackApi, myFeedbackKeys } from "@/feature/feedback/api";
import { myPlanKeys } from "@/feature/plan/api";
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
 * Écrit le débrief. Débriefer change AUSSI le statut de la séance (DONE) : on invalide donc le
 * détail de la séance et le cycle, sinon le planning continuerait d'afficher « À faire » sur une
 * séance qu'on vient de débriefer.
 */
export function useUpsertFeedback(sessionId: string, onSaved?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertSessionFeedbackInput) => athleteFeedbackApi.upsert(sessionId, input),
    onSuccess: (feedback) => {
      // Le suivi local a fait son travail : le garder ferait diverger les deux copies au
      // prochain chargement de la séance.
      onSaved?.();
      queryClient.setQueryData(myFeedbackKeys.detail(sessionId), feedback);
      queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: myPlanKeys.visible() });
    },
  });
}
