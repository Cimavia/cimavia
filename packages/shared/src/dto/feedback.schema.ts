import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

export const FEEDBACK_CONTENT_MAX_LENGTH = 5000;

// Photo / vidéo d'un débrief. L'audio n'apparaît qu'avec la messagerie (P5) : le débrief ne le
// propose pas en MVP (CDC §5.6), d'où un enum volontairement restreint à deux valeurs.
export const MediaType = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
} as const;
export type MediaType = TypesValuesOf<typeof MediaType>;
export const mediaTypeSchema = z.enum(MediaType);

// Plafonds MVP (CDC §6 et §10). La vidéo est le principal poste de coût : ces bornes gardent
// le stockage prévisible. Source UNIQUE — l'API (schémas ci-dessous) et les clients (contrôle
// avant capture/upload) s'y réfèrent tous les deux.
export const MAX_FEEDBACK_PHOTOS = 5;
export const MAX_FEEDBACK_VIDEOS = 3;
export const MAX_FEEDBACK_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FEEDBACK_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_FEEDBACK_VIDEO_DURATION_SECONDS = 60;

// Cibles de compression CLIENT (le serveur ne transcode pas — cf. dette P4) : la photo est
// réduite à cette dimension max, la vidéo capturée à cette hauteur max.
export const FEEDBACK_PHOTO_MAX_DIMENSION_PX = 1600;
export const FEEDBACK_VIDEO_MAX_HEIGHT_PX = 720;

export const FEEDBACK_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type FeedbackImageMimeType = (typeof FEEDBACK_IMAGE_MIME_TYPES)[number];
export const feedbackImageMimeTypeSchema = z.enum(FEEDBACK_IMAGE_MIME_TYPES);

// MP4 (Android, export standard) et QuickTime (capture iOS native).
export const FEEDBACK_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;
export type FeedbackVideoMimeType = (typeof FEEDBACK_VIDEO_MIME_TYPES)[number];
export const feedbackVideoMimeTypeSchema = z.enum(FEEDBACK_VIDEO_MIME_TYPES);

// Gardes de type : permettent au client de filtrer un mime (string) avant l'envoi.
export function isAllowedFeedbackImageMime(mimeType: string): mimeType is FeedbackImageMimeType {
  return (FEEDBACK_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isAllowedFeedbackVideoMime(mimeType: string): mimeType is FeedbackVideoMimeType {
  return (FEEDBACK_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Quota de médias par débrief, par type. Le nombre déjà attaché n'étant connu que de la base,
 * ce plafond ne peut pas être appliqué par le schéma (contrairement au mime, à la taille et à
 * la durée) : le service compte puis rejette en 409. Cette fonction reste la source unique de
 * la valeur — le client s'en sert pour désactiver le bouton d'ajout.
 */
export function maxFeedbackMediaCount(type: MediaType): number {
  return type === MediaType.VIDEO ? MAX_FEEDBACK_VIDEOS : MAX_FEEDBACK_PHOTOS;
}

export function maxFeedbackMediaSizeBytes(type: MediaType): number {
  return type === MediaType.VIDEO ? MAX_FEEDBACK_VIDEO_SIZE_BYTES : MAX_FEEDBACK_PHOTO_SIZE_BYTES;
}

// ── Entrées athlète ──────────────────────────────────────────────────────────

/**
 * Débrief : un seul champ texte libre, NULLABLE — un débrief peut n'être que des photos, et
 * l'athlète peut le compléter en plusieurs fois (texte d'abord, médias plus tard, ou l'inverse).
 * Aucune règle « texte OU média » ici : elle interdirait précisément le débrief média-seul, qui
 * doit bien créer un débrief vide avant d'y rattacher le premier fichier.
 */
export const upsertSessionFeedbackSchema = z
  .object({
    content: z.string().max(FEEDBACK_CONTENT_MAX_LENGTH).nullable().optional(),
  })
  .strict();
export type UpsertSessionFeedbackInput = z.infer<typeof upsertSessionFeedbackSchema>;

// Mime, taille et durée sont contraints ICI → l'API rejette en 400 sans code dédié, et le
// client réutilise les mêmes bornes avant de lancer la capture.
export const requestFeedbackUploadUrlSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal(MediaType.IMAGE),
      fileName: z.string().min(1),
      mimeType: feedbackImageMimeTypeSchema,
      size: z.number().int().positive().max(MAX_FEEDBACK_PHOTO_SIZE_BYTES),
    })
    .strict(),
  z
    .object({
      type: z.literal(MediaType.VIDEO),
      fileName: z.string().min(1),
      mimeType: feedbackVideoMimeTypeSchema,
      size: z.number().int().positive().max(MAX_FEEDBACK_VIDEO_SIZE_BYTES),
      // Déclarée par le client (le serveur ne décode pas le fichier) : la borne des 60 s est
      // donc déclarative. La taille, elle, est vérifiée par le storage à l'upload.
      durationSeconds: z.number().int().positive().max(MAX_FEEDBACK_VIDEO_DURATION_SECONDS),
    })
    .strict(),
]);
export type RequestFeedbackUploadUrlInput = z.infer<typeof requestFeedbackUploadUrlSchema>;

// Rattachement, après l'upload direct vers le storage.
export const attachFeedbackMediaSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal(MediaType.IMAGE),
      storagePath: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: feedbackImageMimeTypeSchema,
      size: z.number().int().positive().max(MAX_FEEDBACK_PHOTO_SIZE_BYTES),
    })
    .strict(),
  z
    .object({
      type: z.literal(MediaType.VIDEO),
      storagePath: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: feedbackVideoMimeTypeSchema,
      size: z.number().int().positive().max(MAX_FEEDBACK_VIDEO_SIZE_BYTES),
      durationSeconds: z.number().int().positive().max(MAX_FEEDBACK_VIDEO_DURATION_SECONDS),
    })
    .strict(),
]);
export type AttachFeedbackMediaInput = z.infer<typeof attachFeedbackMediaSchema>;

// ── DTO de sortie ────────────────────────────────────────────────────────────

export const feedbackMediaDtoSchema = z.object({
  id: z.string(),
  type: mediaTypeSchema,
  // URL GET signée, régénérée à chaque lecture (bucket privé) — jamais une URL publique.
  url: z.url(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  durationSeconds: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});
export type FeedbackMediaDto = z.infer<typeof feedbackMediaDtoSchema>;

export const sessionFeedbackDtoSchema = z.object({
  id: z.string(),
  scheduledSessionId: z.string(),
  athleteId: z.string(),
  content: z.string().nullable(),
  coachReadAt: z.iso.datetime().nullable(),
  media: z.array(feedbackMediaDtoSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SessionFeedbackDto = z.infer<typeof sessionFeedbackDtoSchema>;

// Vue coach : de quoi lister les débriefs reçus sans charger les médias (tuile dashboard,
// écran « Débriefs »). Le détail passe par la lecture du débrief de la séance.
export const coachFeedbackSummaryDtoSchema = z.object({
  id: z.string(),
  scheduledSessionId: z.string(),
  planId: z.string(),
  athleteId: z.string(),
  athleteName: z.string(),
  sessionTitle: z.string(),
  scheduledDate: z.iso.date(),
  content: z.string().nullable(),
  mediaCount: z.number().int(),
  coachReadAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CoachFeedbackSummaryDto = z.infer<typeof coachFeedbackSummaryDtoSchema>;
