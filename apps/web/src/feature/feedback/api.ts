import type { CoachFeedbackSummaryDto, SessionFeedbackDto } from "@cmv/shared";
import { api } from "@/shared/lib/api";

export const feedbackKeys = {
  all: ["feedbacks"] as const,
  list: () => ["feedbacks", "list"] as const,
  bySession: (sessionId: string) => ["feedbacks", "session", sessionId] as const,
};

// Tous les débriefs reçus, du plus récemment touché au plus ancien (ordre imposé par l'API).
export function listFeedbacks(): Promise<CoachFeedbackSummaryDto[]> {
  return api.get<CoachFeedbackSummaryDto[]>("/feedbacks");
}

// `null` si la séance n'a pas encore été débriefée — l'absence est un état normal.
export function getSessionFeedback(sessionId: string): Promise<SessionFeedbackDto | null> {
  return api.get<SessionFeedbackDto | null>(`/scheduled-sessions/${sessionId}/feedback`);
}

export function markFeedbackRead(id: string): Promise<CoachFeedbackSummaryDto> {
  return api.post<CoachFeedbackSummaryDto>(`/feedbacks/${id}/read`);
}
