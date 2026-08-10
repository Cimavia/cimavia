import type { UploadUrlDto } from "../dto/exercise.schema";
import type {
  AttachFeedbackMediaInput,
  FeedbackMediaDto,
  RequestFeedbackUploadUrlInput,
  SessionFeedbackDto,
  UpsertSessionFeedbackInput,
} from "../dto/feedback.schema";
import type { ApiClient } from "./client";

/**
 * Appels HTTP du débrief ÉCRIT par l'athlète, partagés web ↔ mobile.
 *
 * Toutes les routes sont sous `/me/scheduled-sessions/:id/feedback`, gardées `@Roles([ATHLETE])`.
 * La surface de LECTURE du coach (`/feedbacks`, `/feedbacks/:id/read`) est un autre contrôleur et
 * reste dans `apps/web` jusqu'à ce que #33 lui donne son second client.
 *
 * Le flux média est en TROIS temps et l'ordre n'est pas négociable : demander une URL signée,
 * envoyer le binaire **directement au bucket**, puis confirmer le rattachement. Le binaire ne
 * transite jamais par l'API (règle 7). L'étape 1 refuse déjà un quota dépassé (409) ou un fichier
 * hors plafonds (400) — avant qu'un seul octet parte.
 */

/**
 * Racine distincte de celle du coach (`["feedbacks", …]`, `apps/web/src/feature/feedback/api.ts`),
 * qui désigne `/feedbacks` : deux routes, deux gardes, deux contenus. Un singulier contre un
 * pluriel aurait « marché » tant qu'un rôle exclut l'autre — même piège que les clés de séance,
 * évité de la même façon (cf. `myPlanKeys`).
 */
export const myFeedbackKeys = {
  all: ["my-feedback"] as const,
  detail: (sessionId: string) => ["my-feedback", "detail", sessionId] as const,
};

export type AthleteFeedbackApi = {
  /** `null` tant que la séance n'a pas été débriefée — l'absence est un état normal, pas une erreur. */
  get: (sessionId: string) => Promise<SessionFeedbackDto | null>;
  /**
   * Idempotent : crée le débrief ou le complète, et passe la séance en `DONE` côté API. Le texte
   * est nullable — un débrief peut n'être que des médias, et se compléter en plusieurs fois.
   */
  upsert: (sessionId: string, input: UpsertSessionFeedbackInput) => Promise<SessionFeedbackDto>;
  /** Étape 1 : l'API signe une URL PUT vers le bucket privé (et vérifie quota et plafonds). */
  requestMediaUploadUrl: (
    sessionId: string,
    input: RequestFeedbackUploadUrlInput,
  ) => Promise<UploadUrlDto>;
  /** Étape 3 : rattacher le média uploadé (crée le débrief s'il n'existait pas encore). */
  attachMedia: (sessionId: string, input: AttachFeedbackMediaInput) => Promise<FeedbackMediaDto>;
  /** Purge l'objet directement : un média de débrief n'est jamais partagé ni copié. */
  deleteMedia: (sessionId: string, mediaId: string) => Promise<void>;
};

export function createAthleteFeedbackApi(api: ApiClient): AthleteFeedbackApi {
  const base = (sessionId: string) => `/me/scheduled-sessions/${sessionId}/feedback`;

  return {
    get: (sessionId) => api.get<SessionFeedbackDto | null>(base(sessionId)),
    upsert: (sessionId, input) => api.put<SessionFeedbackDto>(base(sessionId), input),
    requestMediaUploadUrl: (sessionId, input) =>
      api.post<UploadUrlDto>(`${base(sessionId)}/media/upload-url`, input),
    attachMedia: (sessionId, input) =>
      api.post<FeedbackMediaDto>(`${base(sessionId)}/media`, input),
    deleteMedia: (sessionId, mediaId) => api.delete<void>(`${base(sessionId)}/media/${mediaId}`),
  };
}
