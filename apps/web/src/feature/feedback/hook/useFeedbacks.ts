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

export function useFeedbacks() {
  return useQuery<CoachFeedbackSummaryDto[]>({
    queryKey: feedbackKeys.list(),
    queryFn: listFeedbacks,
    refetchInterval: FEEDBACKS_POLL_MS,
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
