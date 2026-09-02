import { z } from "zod";

/**
 * Les bornes média **génériques** : formats acceptés, poids et durée d'une photo ou d'une vidéo.
 *
 * Elles ont été fixées pour le débrief (CDC §6 et §10) — d'où le préfixe, qui dit d'où elles
 * viennent — puis reprises telles quelles par la messagerie, qui n'avait aucune raison de se
 * donner d'autres plafonds sur les mêmes fichiers. Elles vivent ici, et non dans l'un des deux
 * schémas, pour une raison mécanique : `feedback.schema` doit désormais lire `message.schema`
 * (un débrief porte les messages qui lui répondent), donc `message.schema` ne peut plus lire
 * `feedback.schema`. Entre deux modules de schémas Zod évalués au chargement, un cycle n'est pas
 * un avertissement de linter — c'est une TDZ à l'initialisation.
 *
 * Ce qui reste propre à chaque surface n'est PAS ici : les quotas par débrief, les cibles de
 * compression, et l'audio — dont les formats diffèrent réellement (la messagerie accepte le webm
 * du navigateur, le débrief non).
 */

// MP4 (Android, export standard) et QuickTime (capture iOS native).
export const FEEDBACK_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;
export type FeedbackVideoMimeType = (typeof FEEDBACK_VIDEO_MIME_TYPES)[number];
export const feedbackVideoMimeTypeSchema = z.enum(FEEDBACK_VIDEO_MIME_TYPES);

export const FEEDBACK_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type FeedbackImageMimeType = (typeof FEEDBACK_IMAGE_MIME_TYPES)[number];
export const feedbackImageMimeTypeSchema = z.enum(FEEDBACK_IMAGE_MIME_TYPES);

// Poids par fichier : ce qui garde le stockage prévisible, la vidéo étant le principal poste de
// coût. La durée est déclarée par le client (le serveur ne décode pas — cf. dette P4-2).
export const MAX_FEEDBACK_PHOTO_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_FEEDBACK_VIDEO_SIZE_BYTES = 1000 * 1024 * 1024;
export const MAX_FEEDBACK_VIDEO_DURATION_SECONDS = 180;

// Gardes de type : permettent au client de filtrer un mime (string) avant l'envoi.
export function isAllowedFeedbackImageMime(mimeType: string): mimeType is FeedbackImageMimeType {
  return (FEEDBACK_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isAllowedFeedbackVideoMime(mimeType: string): mimeType is FeedbackVideoMimeType {
  return (FEEDBACK_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType);
}
