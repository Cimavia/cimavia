import type { CoachFeedbackSummaryDto, SessionFeedbackDto } from "@cmv/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  feedbackKeys,
  getSessionFeedback,
  listFeedbacks,
  markFeedbackRead,
} from "@/feature/feedback/api";
import { useMutationToast } from "@/shared/hook/useMutationToast";

export function useFeedbacks() {
  return useQuery<CoachFeedbackSummaryDto[]>({
    queryKey: feedbackKeys.list(),
    queryFn: listFeedbacks,
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

// Ce que compte la tuile « Débriefs à relire » : les non lus, et ceux que l'athlète a complétés
// depuis (l'API repasse alors `coachReadAt` à null).
export function unreadCount(feedbacks: CoachFeedbackSummaryDto[] | undefined): number | null {
  if (feedbacks == null) return null;
  return feedbacks.filter((feedback) => feedback.coachReadAt == null).length;
}
