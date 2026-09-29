import {
  type FeedbackTracking,
  type ScheduledSessionDto,
  type SessionFeedbackDto,
  type UpsertSessionFeedbackInput,
  withSentTracking,
} from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { athleteFeedbackApi, myFeedbackKeys } from "@/feature/feedback/api";
import { myPlanKeys } from "@/feature/plan/api";
import { ApiError } from "@/shared/lib/api";
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
 *
 * Un REFUS (400) invalide la séance aussi, et c'est la seule panne qui le fait. Le serveur refuse
 * un suivi qui cite un exercice absent de la séance (#311) ; l'écran filtre bien ces coches avant
 * l'envoi, mais d'après la séance EN CACHE — persistée, et tenue pour fraîche cinq minutes. Si le
 * coach vient d'en retirer un exercice, le filtre ne le sait pas encore : relire la séance est ce
 * qui laisse passer l'envoi suivant (#490). Le suivi local, lui, n'est pas touché — `onSaved`
 * n'est appelé qu'au succès.
 */
export function useUpsertFeedback(
  sessionId: string,
  onSaved?: (sent: FeedbackTracking | undefined) => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpsertSessionFeedbackInput) => athleteFeedbackApi.upsert(sessionId, input),
    onSuccess: (feedback, input) => {
      // Le cache de la séance d'abord : sitôt le local effacé, c'est lui que les écrans affichent.
      if (input.tracking != null) {
        const sent = input.tracking;
        queryClient.setQueryData<ScheduledSessionDto>(myPlanKeys.session(sessionId), (session) =>
          session == null ? session : withSentTracking(session, sent),
        );
      }
      // Le suivi local a fait son travail : le garder ferait diverger les deux copies au
      // prochain chargement de la séance. Ce qui est PARTI accompagne l'appel, pour qu'une coche
      // posée pendant l'envoi ne soit pas effacée avec lui (#499).
      onSaved?.(input.tracking);
      queryClient.setQueryData(myFeedbackKeys.detail(sessionId), feedback);
      queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      queryClient.invalidateQueries({ queryKey: myPlanKeys.visible() });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        queryClient.invalidateQueries({ queryKey: myPlanKeys.session(sessionId) });
      }
    },
  });
}
