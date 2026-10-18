import { z } from "zod";
import type { TrainingCapability } from "../capability";
import type { TypesValuesOf } from "../type/generics.type";
import {
  feedbackImageMimeTypeSchema,
  feedbackVideoMimeTypeSchema,
  MAX_FEEDBACK_PHOTO_SIZE_BYTES,
  MAX_FEEDBACK_VIDEO_DURATION_SECONDS,
  MAX_FEEDBACK_VIDEO_SIZE_BYTES,
  mediaBatchShape,
} from "./media.schema";

/**
 * Messagerie à participants, à deux ou à plusieurs (CDC §5.8, #611). Un message est SOIT du texte SOIT UN média
 * (audio/image/vidéo) — jamais les deux (pas de légende sur média en MVP). `TEXT` n'étant pas un
 * média, l'enum est distinct du `MediaType` du débrief : le débrief vocal ajoutera `AUDIO` là-bas,
 * pas ici. Image et vidéo réutilisent les bornes du débrief (mêmes plafonds génériques, source
 * unique) ; l'audio a les siennes.
 *
 * Les deux derniers ne sont pas écrits par quelqu'un : ce sont des **avis**, posés par le serveur
 * quand l'athlète dépose ou complète un débrief. Ils ne portent NI texte NI média — seulement leur
 * `sessionFeedbackId` —, et leur libellé se rend côté client (`FEEDBACK_EVENT_LABEL_KEY`). Écrire
 * la phrase en base la figerait en français, ce que « Tranché en #48 » a déjà écarté pour les
 * notifications. Ils restent hors de `sendMessageSchema` : aucun client ne peut en fabriquer un.
 */
export const MessageType = {
  TEXT: "TEXT",
  AUDIO: "AUDIO",
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  FEEDBACK_CREATED: "FEEDBACK_CREATED",
  FEEDBACK_UPDATED: "FEEDBACK_UPDATED",
} as const;
export type MessageType = TypesValuesOf<typeof MessageType>;
export const messageTypeSchema = z.enum(MessageType);

/**
 * Les types qu'aucun humain n'écrit. Sert des deux côtés : le serveur y lit ce qu'il a déjà annoncé
 * pour un débrief, les clients ce qu'ils doivent rendre comme un avis plutôt que comme une bulle.
 */
export const FEEDBACK_EVENT_MESSAGE_TYPES = [
  MessageType.FEEDBACK_CREATED,
  MessageType.FEEDBACK_UPDATED,
] as const;
export type FeedbackEventMessageType = (typeof FEEDBACK_EVENT_MESSAGE_TYPES)[number];

export function isFeedbackEventMessage(type: MessageType): type is FeedbackEventMessageType {
  return (FEEDBACK_EVENT_MESSAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Le libellé d'un avis, en clés LITTÉRALES — comme `MESSAGE_ATTACHMENT_LABEL_KEY`, et pour la même
 * raison : une clé assemblée depuis le type n'est vue ni par TypeScript ni par `check:i18n`.
 */
export const FEEDBACK_EVENT_LABEL_KEY = {
  [MessageType.FEEDBACK_CREATED]: "messages.feedback.created",
  [MessageType.FEEDBACK_UPDATED]: "messages.feedback.updated",
} as const satisfies Record<FeedbackEventMessageType, string>;

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
/**
 * Combien de médias un même geste peut envoyer dans un fil.
 *
 * Contrairement au débrief, la messagerie n'a AUCUN quota — chaque média y est un message — donc
 * rien ne borne naturellement une sélection : quarante vidéos partiraient à la suite. C'est une
 * borne d'usage côté client, pas une règle métier : le serveur n'en sait rien et n'a pas à en
 * savoir. Elle vit ici pour que les deux surfaces ne s'en donnent pas deux valeurs différentes.
 */
export const MAX_MESSAGE_MEDIA_BATCH = 10;

export {
  FEEDBACK_IMAGE_MIME_TYPES as MESSAGE_IMAGE_MIME_TYPES,
  FEEDBACK_VIDEO_MIME_TYPES as MESSAGE_VIDEO_MIME_TYPES,
} from "./media.schema";

// ── Entrées ──────────────────────────────────────────────────────────────────

/**
 * Rattachement optionnel d'un message à une séance ou un débrief (« à propos de… »). Orthogonal au
 * type : ces champs se greffent sur chaque variante ci-dessous. Ids vérifiés au service (la FK
 * n'impose pas le tenant) : TOUS les participants doivent lire la cible (#611) — côté athlète, une
 * séance passe en plus par le filtre PUBLISHED.
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
      ...mediaBatchShape,
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
      ...mediaBatchShape,
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
      ...mediaBatchShape,
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
 * Les deux capacités au titre desquelles on participe à une conversation (#611) — celles
 * d'ENTRAÎNEMENT : le compte Entreprise n'est dans aucune.
 */
export const participantCapabilitySchema = z.enum([
  "coach",
  "athlete",
] as const satisfies readonly TrainingCapability[]);

/**
 * Combien d'AUTRES participants une conversation réunit au plus (#611). Chaque envoi pousse et
 * trace à chacun : la borne protège aussi l'envoi. Au-delà, on écrit à plusieurs groupes.
 */
export const MAX_CONVERSATION_PARTICIPANTS = 20;

/**
 * Créer une conversation — ou rouvrir celle qui réunit déjà exactement ces participants, à deux
 * comme à plusieurs (tranché en #598). On y nomme les AUTRES : l'acteur en est d'office, au titre
 * de la capacité qu'il exerce.
 *
 * La capacité de chacun est dite, pas devinée : un même compte peut être l'athlète du Coach ET un
 * Coach de son entreprise, et ce sont alors deux conversations distinctes. Ceux qu'on a le droit
 * de réunir dépendent de l'acteur, que le schéma ne connaît pas : c'est le service qui refuse.
 */
export const createConversationSchema = z
  .object({
    participants: z
      .array(
        z.object({ userId: z.string().min(1), capability: participantCapabilitySchema }).strict(),
      )
      .min(1)
      .max(MAX_CONVERSATION_PARTICIPANTS)
      .refine(
        (participants) =>
          new Set(participants.map((participant) => participant.userId)).size ===
          participants.length,
        { message: "Un participant ne se nomme qu'une fois" },
      ),
  })
  .strict();
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

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

/**
 * Ce sur quoi un message porte : une séance planifiée, ou le débrief de cette séance.
 *
 * `SESSION_FEEDBACK` reste un type distinct de `SCHEDULED_SESSION` alors que les deux se lisent
 * par la même séance : « à propos de ta séance » et « à propos de ton débrief » ne mènent pas au
 * même écran, et ne se disent pas de la même façon.
 */
export const MessageAttachmentType = {
  SCHEDULED_SESSION: "SCHEDULED_SESSION",
  SESSION_FEEDBACK: "SESSION_FEEDBACK",
} as const;
export type MessageAttachmentType = TypesValuesOf<typeof MessageAttachmentType>;
export const messageAttachmentTypeSchema = z.enum(MessageAttachmentType);

/**
 * Le rattachement d'un message, RÉSOLU à la lecture — jamais stocké.
 *
 * Le serveur ne produit aucune string : il rend de quoi en composer une (le titre de la séance et
 * sa date), et le `type` choisit la clé i18n. Figer un libellé en base mentirait le jour où le
 * cycle est renommé, et gèlerait le français avant l'arrivée de `en.json` — même règle que
 * `NOTIFICATION_LABEL_KEY`.
 *
 * Une seule forme pour les deux types, et non une union :
 * - un débrief n'a pas de titre, mais la séance qu'il débriefe en a un — ce n'est pas un titre
 *   inventé, c'est le sien ; un coach qui suit dix athlètes ne fait rien de « le débrief du 16 » ;
 * - `scheduledSessionId` n'est pas du confort : la route mobile d'un débrief côté coach est
 *   `/feedbacks/[sessionId]`, pas un id de débrief. Sans lui, la puce n'a nulle part où aller.
 */
export const messageAttachmentDtoSchema = z.object({
  type: messageAttachmentTypeSchema,
  /** L'id de la cible elle-même : la séance, ou le débrief. */
  id: z.string(),
  /** La séance concernée dans les deux cas — celle qui est citée, ou celle qui est débriefée. */
  scheduledSessionId: z.string(),
  sessionTitle: z.string(),
  scheduledDate: z.iso.date(),
});
export type MessageAttachmentDto = z.infer<typeof messageAttachmentDtoSchema>;

export const messageDtoSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(), // le client aligne la bulle en comparant à l'utilisateur courant
  type: messageTypeSchema,
  content: z.string().nullable(), // texte (type TEXT) — null pour un média
  media: messageMediaDtoSchema.nullable(), // média — null pour un texte
  scheduledSessionId: z.string().nullable(),
  sessionFeedbackId: z.string().nullable(),
  /**
   * La cible du rattachement, résolue. `null` quand le message ne porte sur rien — mais AUSSI
   * quand la cible a disparu : la FK est `SetNull`, le message survit et perd son contexte. Un
   * message « à propos de » ne l'est donc pas à vie.
   */
  attachment: messageAttachmentDtoSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

/**
 * À deux ou à plusieurs (#611). Une conversation à deux est `DIRECT`, à trois ou plus `GROUP` —
 * fixé à la création, comme ses participants.
 */
export const ConversationKind = {
  DIRECT: "DIRECT",
  GROUP: "GROUP",
} as const;
export type ConversationKind = TypesValuesOf<typeof ConversationKind>;
export const conversationKindSchema = z.enum(ConversationKind);

/**
 * Un AUTRE participant, vu de l'acteur. `lastReadAt` est sa marque de lecture : ce qu'il a lu,
 * c'est tout message créé jusque-là — de quoi dire « Lu par » (#612). `null` = il n'a encore rien
 * lu, pas une donnée manquante.
 */
export const conversationParticipantDtoSchema = z.object({
  userId: z.string(),
  name: z.string(),
  capability: participantCapabilitySchema,
  lastReadAt: z.iso.datetime().nullable(),
});
export type ConversationParticipantDto = z.infer<typeof conversationParticipantDtoSchema>;

/**
 * Vue liste de conversations, du point de vue de l'acteur courant : `participants` nomme les
 * AUTRES — un seul pour une conversation `DIRECT` —, `lastReadAt` est la sienne.
 *
 * L'aperçu du dernier message reste le texte brut ; pour un média, `lastMessageType` porte le type
 * et le client en fait un libellé i18n (pas de string produite côté serveur). `lastMessageSenderId`
 * dit qui l'a écrit, pour l'aperçu « Vous : » / « M : » (tranché en #598). Les trois sont `null`
 * tant que la conversation n'a aucun message — elle se trie alors à sa création
 * (`lastMessageAt ?? createdAt`).
 */
export const conversationDtoSchema = z.object({
  id: z.string(),
  kind: conversationKindSchema,
  participants: z.array(conversationParticipantDtoSchema),
  lastReadAt: z.iso.datetime().nullable(),
  lastMessageAt: z.iso.datetime().nullable(),
  lastMessageSenderId: z.string().nullable(),
  lastMessageType: messageTypeSchema.nullable(),
  lastMessagePreview: z.string().nullable(), // texte du dernier message ; null si média ou vide
  unreadCount: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type ConversationDto = z.infer<typeof conversationDtoSchema>;

/**
 * Un Coach qu'on peut réunir dans une conversation (#611).
 *
 * - `organizationNames` : d'où il vient. Côté athlète, l'entreprise du lien (au plus une, vide pour
 *   un lien direct) ; côté Coach, les entreprises qu'on partage avec lui.
 * - `followedAthleteIds` : ceux des athlètes de l'acteur qu'il suit — de quoi prévenir que M ne
 *   suit pas TE avant de les réunir (#612). Côté athlète, sans objet : `null`.
 */
export const coachCandidateDtoSchema = z.object({
  userId: z.string(),
  name: z.string(),
  organizationNames: z.array(z.string()),
  followedAthleteIds: z.array(z.string()).nullable(),
});
export type CoachCandidateDto = z.infer<typeof coachCandidateDtoSchema>;

/** Un athlète qu'un Coach peut réunir : l'un des siens. */
export const athleteCandidateDtoSchema = z.object({
  userId: z.string(),
  name: z.string(),
});
export type AthleteCandidateDto = z.infer<typeof athleteCandidateDtoSchema>;

/**
 * Ceux que l'acteur peut réunir, au titre exercé (#611) : un athlète, ses Coachs ; un Coach, ses
 * athlètes (`ATHLETE`) et les Coachs de ses entreprises (`COACH`). Jamais soi-même, jamais un compte
 * Entreprise. Côté athlète, `athletes` est vide : un athlète n'écrit pas à un autre athlète.
 */
export const conversationCandidatesDtoSchema = z.object({
  athletes: z.array(athleteCandidateDtoSchema),
  coaches: z.array(coachCandidateDtoSchema),
});
export type ConversationCandidatesDto = z.infer<typeof conversationCandidatesDtoSchema>;
