import type { CoachFeedbackSummaryDto, SessionFeedbackDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  feedbackKeys,
  getSessionFeedback,
  listFeedbacks,
  markFeedbackRead,
} from "@/feature/feedback/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

const FEEDBACKS_POLL_MS = 30_000;

/**
 * `poll: false` pour les écrans qui n'affichent qu'un COMPTEUR tiré de cette liste (le tableau de
 * bord). Le sondage existe pour l'écran des débriefs, où le coach attend un retour en direct ; le
 * garder ailleurs ferait tourner une requête toutes les 30 s sur la page d'accueil, en permanence,
 * pour un chiffre que personne ne regarde changer.
 *
 * Ce qui reste actif dans les deux cas : `refetchOnWindowFocus` (défaut TanStack sur le web) — le
 * chiffre est donc à jour dès qu'on revient sur l'onglet, ce qui est le vrai moment où on le lit.
 */
export function useFeedbacks({ poll = true }: { poll?: boolean } = {}) {
  return useQuery<CoachFeedbackSummaryDto[]>({
    queryKey: feedbackKeys.list(),
    queryFn: listFeedbacks,
    refetchInterval: poll ? FEEDBACKS_POLL_MS : false,
  });
}

export function useSessionFeedback(sessionId: string) {
  return useQuery<SessionFeedbackDto | null>({
    queryKey: feedbackKeys.bySession(sessionId),
    queryFn: () => getSessionFeedback(sessionId),
  });
}

export function useMarkFeedbackRead() {
  const queryClient = useQueryClient();
  const toast = useMutationToast();

  return useMutation({
    mutationFn: (id: string) => markFeedbackRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: feedbackKeys.all });
    },
    onError: toast.onError,
  });
}
