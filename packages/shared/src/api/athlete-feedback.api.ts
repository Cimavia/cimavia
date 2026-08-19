import type {
  AttachFeedbackMediaInput,
  FeedbackMediaDto,
  RequestFeedbackUploadUrlInput,
  SessionFeedbackDto,
  UpsertSessionFeedbackInput,
} from "../dto/feedback.schema";
import type {
  AbortMultipartUploadInput,
  CompleteMultipartUploadInput,
  MediaUploadTicketDto,
} from "../dto/upload.schema";
import type { ApiClient } from "./client";

/**
 * Appels HTTP du débrief ÉCRIT par l'athlète, partagés web ↔ mobile.
 *
 * Toutes les routes sont sous `/me/scheduled-sessions/:id/feedback`, gardées `@Roles([ATHLETE])`.
 * La surface de LECTURE du coach (`/feedbacks`, `/feedbacks/:id/read`) est un autre contrôleur et
 * reste dans `apps/web` jusqu'à ce que #33 lui donne son second client.
 *
 * Le flux média est en TROIS temps et l'ordre n'est pas négociable : demander un ticket d'upload,
 * envoyer le binaire **directement au bucket**, puis confirmer le rattachement. Le binaire ne
 * transite jamais par l'API (règle 7). L'étape 1 refuse déjà un quota dépassé (409) ou un fichier
 * hors plafonds (400) — avant qu'un seul octet parte.
 *
 * Le ticket dicte la FORME de l'étape 2, et le client doit brancher dessus : un PUT unique pour les
 * fichiers courants, un envoi part par part suivi d'une clôture au-delà du seuil (le bord réseau
 * refusant tout corps de plus de 100 Mo — cf. `upload.schema.ts`). La clôture est une quatrième
 * étape qui n'existe QUE dans ce second cas : tant qu'elle n'a pas eu lieu, les parts déjà montées
 * ne forment aucun objet.
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
  /**
   * Étape 1 : l'API signe l'envoi vers le bucket privé (et vérifie quota et plafonds). Le mode du
   * ticket dit si l'étape 2 est un PUT unique ou un envoi découpé.
   */
  requestMediaUploadUrl: (
    sessionId: string,
    input: RequestFeedbackUploadUrlInput,
  ) => Promise<MediaUploadTicketDto>;
  /**
   * Étape 2 bis (mode découpé UNIQUEMENT) : recoller les parts en un objet. Sans cet appel, rien
   * n'existe dans le bucket — le rattachement porterait sur un chemin vide.
   */
  completeMediaUpload: (sessionId: string, input: CompleteMultipartUploadInput) => Promise<void>;
  /**
   * Renoncer à un envoi découpé (annulation, part définitivement perdue). À appeler même quand
   * l'utilisateur abandonne : les parts orphelines restent facturées sans apparaître au bucket.
   */
  abortMediaUpload: (sessionId: string, input: AbortMultipartUploadInput) => Promise<void>;
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
      api.post<MediaUploadTicketDto>(`${base(sessionId)}/media/upload-url`, input),
    completeMediaUpload: (sessionId, input) =>
      api.post<void>(`${base(sessionId)}/media/upload/complete`, input),
    abortMediaUpload: (sessionId, input) =>
      api.post<void>(`${base(sessionId)}/media/upload/abort`, input),
    attachMedia: (sessionId, input) =>
      api.post<FeedbackMediaDto>(`${base(sessionId)}/media`, input),
    deleteMedia: (sessionId, mediaId) => api.delete<void>(`${base(sessionId)}/media/${mediaId}`),
  };
}
