import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import {
  FEEDBACK_IMAGE_MIME_TYPES,
  FEEDBACK_VIDEO_MIME_TYPES,
  feedbackImageMimeTypeSchema,
  feedbackVideoMimeTypeSchema,
  MAX_FEEDBACK_PHOTO_SIZE_BYTES,
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MAX_FEEDBACK_VIDEO_SIZE_BYTES,
} from "./feedback.schema";

/**
 * Messagerie 1:1 coach ↔ athlète (CDC §5.8). Un message est SOIT du texte SOIT UN média
 * (audio/image/vidéo) — jamais les deux (pas de légende sur média en MVP). `TEXT` n'étant pas un
 * média, l'enum est distinct du `MediaType` du débrief : le débrief vocal ajoutera `AUDIO` là-bas,
 * pas ici. Image et vidéo réutilisent les bornes du débrief (mêmes plafonds génériques, source
 * unique) ; l'audio a les siennes.
 */
export const MessageType = {
  TEXT: "TEXT",
  AUDIO: "AUDIO",
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
} as const;
export type MessageType = TypesValuesOf<typeof MessageType>;
export const messageTypeSchema = z.enum(MessageType);

export const MESSAGE_TEXT_MAX_LENGTH = 5000;

// Note vocale : m4a (capture native iOS/Android via expo-audio), mp4/aac (conteneurs équivalents),
// webm (MediaRecorder navigateur, côté web). Le serveur ne décode pas — cf. dette P4-2 sur la durée.
export const MESSAGE_AUDIO_MIME_TYPES = [
  "audio/m4a",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
] as const;
export type MessageAudioMimeType = (typeof MESSAGE_AUDIO_MIME_TYPES)[number];
export const messageAudioMimeTypeSchema = z.enum(MESSAGE_AUDIO_MIME_TYPES);

export function isAllowedMessageAudioMime(mimeType: string): mimeType is MessageAudioMimeType {
  return (MESSAGE_AUDIO_MIME_TYPES as readonly string[]).includes(mimeType);
}

// Plafonds note vocale : une note reste courte. La taille est signée dans l'URL PUT (opposable) ;
// la durée est déclarative (le serveur ne décode pas le fichier).
export const MAX_MESSAGE_AUDIO_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_MESSAGE_AUDIO_DURATION_SECONDS = 300;

// Image et vidéo d'un message : mêmes plafonds que le débrief (bornes média génériques).
export const MAX_MESSAGE_IMAGE_SIZE_BYTES = MAX_FEEDBACK_PHOTO_SIZE_BYTES;
export const MAX_MESSAGE_VIDEO_SIZE_BYTES = MAX_FEEDBACK_VIDEO_SIZE_BYTES;
export const MAX_MESSAGE_VIDEO_DURATION_SECONDS = MAX_FEEDBACK_VIDEO_DURATION_SECONDS;
export const MESSAGE_IMAGE_MIME_TYPES = FEEDBACK_IMAGE_MIME_TYPES;
export const MESSAGE_VIDEO_MIME_TYPES = FEEDBACK_VIDEO_MIME_TYPES;

// ── Entrées ──────────────────────────────────────────────────────────────────

/**
 * Rattachement optionnel d'un message à une séance ou un débrief (« à propos de… »). Orthogonal au
 * type : ces champs se greffent sur chaque variante ci-dessous. Ids possédés vérifiés au service
 * (la FK n'impose pas le tenant) — côté athlète, une séance passe par le filtre PUBLISHED.
 */
const messageAttachmentShape = {
  scheduledSessionId: z.string().min(1).nullable().optional(),
  sessionFeedbackId: z.string().min(1).nullable().optional(),
};

/**
 * Envoi d'un message. Union discriminée par `type` : texte (contenu requis) ou média déjà uploadé
 * (clé objet + métadonnées, comme le rattachement d'un média de débrief). Un média ne porte pas de
 * texte — le champ `content` n'existe que sur la branche `TEXT`.
 */
export const sendMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...messageAttachmentShape,
      type: z.literal(MessageType.TEXT),
      content: z.string().min(1).max(MESSAGE_TEXT_MAX_LENGTH),
    })
    .strict(),
  z
    .object({
      ...messageAttachmentShape,
      type: z.literal(MessageType.AUDIO),
      storagePath: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: messageAudioMimeTypeSchema,
      size: z.number().int().positive().max(MAX_MESSAGE_AUDIO_SIZE_BYTES),
      durationSeconds: z.number().int().positive().max(MAX_MESSAGE_AUDIO_DURATION_SECONDS),
    })
    .strict(),
  z
    .object({
      ...messageAttachmentShape,
      type: z.literal(MessageType.IMAGE),
      storagePath: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: feedbackImageMimeTypeSchema,
      size: z.number().int().positive().max(MAX_MESSAGE_IMAGE_SIZE_BYTES),
    })
    .strict(),
  z
    .object({
      ...messageAttachmentShape,
      type: z.literal(MessageType.VIDEO),
      storagePath: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: feedbackVideoMimeTypeSchema,
      size: z.number().int().positive().max(MAX_MESSAGE_VIDEO_SIZE_BYTES),
      durationSeconds: z.number().int().positive().max(MAX_MESSAGE_VIDEO_DURATION_SECONDS),
    })
    .strict(),
]);
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * URL PUT signée pour un média de message (audio/image/vidéo — jamais du texte). Mime, taille et
 * durée sont contraints ICI → 400 automatique du pipe, et le client réutilise les mêmes bornes
 * avant capture. La taille est ensuite signée dans l'URL (ContentLength) donc opposable.
 */
export const requestMessageUploadUrlSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal(MessageType.AUDIO),
      fileName: z.string().min(1),
      mimeType: messageAudioMimeTypeSchema,
      size: z.number().int().positive().max(MAX_MESSAGE_AUDIO_SIZE_BYTES),
      durationSeconds: z.number().int().positive().max(MAX_MESSAGE_AUDIO_DURATION_SECONDS),
    })
    .strict(),
  z
    .object({
      type: z.literal(MessageType.IMAGE),
      fileName: z.string().min(1),
      mimeType: feedbackImageMimeTypeSchema,
      size: z.number().int().positive().max(MAX_MESSAGE_IMAGE_SIZE_BYTES),
    })
    .strict(),
  z
    .object({
      type: z.literal(MessageType.VIDEO),
      fileName: z.string().min(1),
      mimeType: feedbackVideoMimeTypeSchema,
      size: z.number().int().positive().max(MAX_MESSAGE_VIDEO_SIZE_BYTES),
      durationSeconds: z.number().int().positive().max(MAX_MESSAGE_VIDEO_DURATION_SECONDS),
    })
    .strict(),
]);
export type RequestMessageUploadUrlInput = z.infer<typeof requestMessageUploadUrlSchema>;

/**
 * Get-or-create d'un fil. Le coach vise un de SES athlètes (`athleteId` requis, possédé vérifié) ;
 * l'athlète n'a qu'un coach (aucun champ — le service résout la relation). Union discriminée par
 * un `role` explicite plutôt que par la présence du champ, pour un 400 net.
 */
export const openConversationSchema = z
  .object({
    // Optionnel : présent = ouverture côté coach (cible un athlète) ; absent = côté athlète.
    athleteId: z.string().min(1).optional(),
  })
  .strict();
export type OpenConversationInput = z.infer<typeof openConversationSchema>;

// ── DTO de sortie ────────────────────────────────────────────────────────────

// Média d'un message : URL GET signée régénérée à chaque lecture (bucket privé).
export const messageMediaDtoSchema = z.object({
  url: z.url(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  durationSeconds: z.number().int().nullable(), // audio/vidéo uniquement
});
export type MessageMediaDto = z.infer<typeof messageMediaDtoSchema>;

export const messageDtoSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(), // le client aligne la bulle en comparant à l'utilisateur courant
  type: messageTypeSchema,
  content: z.string().nullable(), // texte (type TEXT) — null pour un média
  media: messageMediaDtoSchema.nullable(), // média — null pour un texte
  scheduledSessionId: z.string().nullable(),
  sessionFeedbackId: z.string().nullable(),
  readAt: z.iso.datetime().nullable(), // lu par le destinataire
  createdAt: z.iso.datetime(),
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

/**
 * Vue liste de conversations (surtout le coach, qui en a N). `counterpart*` = l'AUTRE partie du
 * point de vue de l'acteur courant (l'athlète pour le coach, le coach pour l'athlète). L'aperçu du
 * dernier message reste le texte brut ; pour un média, `lastMessageType` porte le type et le client
 * en fait un libellé i18n (pas de string produite côté serveur).
 */
export const conversationDtoSchema = z.object({
  id: z.string(),
  counterpartId: z.string(),
  counterpartName: z.string(),
  lastMessageAt: z.iso.datetime().nullable(),
  lastMessageType: messageTypeSchema.nullable(),
  lastMessagePreview: z.string().nullable(), // texte du dernier message ; null si média ou vide
  unreadCount: z.number().int(),
});
export type ConversationDto = z.infer<typeof conversationDtoSchema>;
