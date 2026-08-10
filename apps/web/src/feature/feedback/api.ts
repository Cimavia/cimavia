import type { CoachFeedbackSummaryDto, SessionFeedbackDto } from "@cmv/shared";
import { createAthleteFeedbackApi } from "@cmv/shared";
import { api } from "@/shared/lib/api";

// ── Lecture coach ────────────────────────────────────────────────────────────
// Surface du COACH (`/feedbacks`), gardée `@Roles([Role.COACH])`. Elle montera dans @cmv/shared
// quand #33 lui donnera son second client — pas avant : promouvoir sans consommateur, c'est figer
// une forme que rien ne valide.

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

// ── Écriture athlète ─────────────────────────────────────────────────────────
// Routes `/me/…`, gardées `@Roles([Role.ATHLETE])` : une autre surface, partagée avec le mobile.
export const athleteFeedbackApi = createAthleteFeedbackApi(api);

export { myFeedbackKeys } from "@cmv/shared";
