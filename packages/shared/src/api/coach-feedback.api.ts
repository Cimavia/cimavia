import type { CoachFeedbackSummaryDto, SessionFeedbackDto } from "../dto/feedback.schema";
import type { ApiClient } from "./client";

/**
 * Appels HTTP de la LECTURE des débriefs par le coach, partagés web ↔ mobile.
 *
 * Le pendant exact de `createAthleteFeedbackApi` : même entité, autre bout. L'athlète ÉCRIT sous
 * `/me/scheduled-sessions/:id/feedback` (`@Roles([ATHLETE])`), le coach LIT sous `/feedbacks`
 * (`@Roles([COACH])`). Deux contrôleurs, deux gardes, deux modules — pas deux copies.
 *
 * `coachReadAt` est le pivot de cette surface : il alimente la tuile « Débriefs à relire », et il
 * **repasse à `null`** quand l'athlète complète son débrief. « Non lu » veut donc dire « quelque
 * chose reste à lire », pas « jamais ouvert » — d'où une route de marquage explicite plutôt qu'un
 * effet de bord de la lecture.
 */

/**
 * Racine distincte de `myFeedbackKeys` (`["my-feedback"]`), qui désigne la surface athlète. Un
 * singulier contre un pluriel « marcherait » tant qu'un rôle exclut l'autre, et casserait en
 * silence avec la double capacité (#7).
 */
export const coachFeedbackKeys = {
  all: ["feedbacks"] as const,
  list: () => ["feedbacks", "list"] as const,
  bySession: (sessionId: string) => ["feedbacks", "session", sessionId] as const,
};

export type CoachFeedbackApi = {
  /** Tous les débriefs reçus, du plus récemment touché au plus ancien (ordre imposé par l'API). */
  list: () => Promise<CoachFeedbackSummaryDto[]>;
  /** `null` si la séance n'a pas encore été débriefée — l'absence est un état normal. */
  getBySession: (sessionId: string) => Promise<SessionFeedbackDto | null>;
  /** Pose `coachReadAt`. Idempotent : rouvrir ne redate pas la lecture. */
  markRead: (feedbackId: string) => Promise<CoachFeedbackSummaryDto>;
};

export function createCoachFeedbackApi(api: ApiClient): CoachFeedbackApi {
  return {
    list: () => api.get<CoachFeedbackSummaryDto[]>("/feedbacks"),
    getBySession: (sessionId) =>
      api.get<SessionFeedbackDto | null>(`/scheduled-sessions/${sessionId}/feedback`),
    markRead: (feedbackId) => api.post<CoachFeedbackSummaryDto>(`/feedbacks/${feedbackId}/read`),
  };
}
