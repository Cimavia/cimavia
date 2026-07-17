import type {
  AttachFeedbackMediaInput,
  FeedbackMediaDto,
  RequestFeedbackUploadUrlInput,
  SessionFeedbackDto,
  UploadUrlDto,
  UpsertSessionFeedbackInput,
} from "@cmv/shared";
import { api } from "@/shared/lib/api";

export const feedbackKeys = {
  all: ["feedback"] as const,
  detail: (sessionId: string) => ["feedback", "detail", sessionId] as const,
};

// `null` tant que la séance n'a pas été débriefée — l'absence est un état normal, pas une erreur.
export function getMyFeedback(sessionId: string): Promise<SessionFeedbackDto | null> {
  return api.get<SessionFeedbackDto | null>(`/me/scheduled-sessions/${sessionId}/feedback`);
}

// Idempotent : crée le débrief ou le complète, et passe la séance en DONE côté API.
export function upsertMyFeedback(
  sessionId: string,
  input: UpsertSessionFeedbackInput,
): Promise<SessionFeedbackDto> {
  return api.put<SessionFeedbackDto>(`/me/scheduled-sessions/${sessionId}/feedback`, input);
}

/**
 * Étape 1 de l'upload : l'API signe une URL PUT vers le bucket privé. Elle refuse déjà ici un
 * quota dépassé (409) ou un fichier hors plafonds (400) — avant qu'on envoie le moindre octet.
 */
export function requestMediaUploadUrl(
  sessionId: string,
  input: RequestFeedbackUploadUrlInput,
): Promise<UploadUrlDto> {
  return api.post<UploadUrlDto>(
    `/me/scheduled-sessions/${sessionId}/feedback/media/upload-url`,
    input,
  );
}

// Étape 3 : rattacher le média uploadé (crée le débrief s'il n'existait pas encore).
export function attachMedia(
  sessionId: string,
  input: AttachFeedbackMediaInput,
): Promise<FeedbackMediaDto> {
  return api.post<FeedbackMediaDto>(`/me/scheduled-sessions/${sessionId}/feedback/media`, input);
}

export function deleteMedia(sessionId: string, mediaId: string): Promise<void> {
  return api.delete<void>(`/me/scheduled-sessions/${sessionId}/feedback/media/${mediaId}`);
}
