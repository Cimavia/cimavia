import type { CapabilityName } from "../capability";
import type {
  ConversationDto,
  MessageDto,
  OpenConversationInput,
  RequestMessageUploadUrlInput,
  SendMessageInput,
} from "../dto/message.schema";
import type {
  AbortMultipartUploadInput,
  CompleteMultipartUploadInput,
  MediaUploadTicketDto,
} from "../dto/upload.schema";
import { asKey, asQuery } from "./as-capability";
import type { ApiClient } from "./client";

/**
 * Appels HTTP de la messagerie, partagés web ↔ mobile.
 *
 * C'est le module le plus dupliqué du dépôt avant promotion : **quatre des six appels étaient
 * rigoureusement identiques** dans les deux apps (`getMessages`, `sendMessage`, `markRead`,
 * `requestUploadUrl`), au caractère près. Seuls les deux premiers différaient — et encore, par
 * l'argument, pas par la route.
 *
 * Rien ici n'est propre à un rôle : `conversation.controller.ts` et `message.controller.ts` portent
 * `@Roles([COACH, ATHLETE])`, et le scope tenant décide de ce que chacun voit. Un fil est 1:1 ; le
 * coach en a N (un par athlète), l'athlète au plus un (avec son coach).
 */

/**
 * Une seule racine `messages` pour tout : les fils, un fil résolu, et les messages d'un fil.
 *
 * C'est ce qui rend l'invalidation après envoi correcte d'un seul geste — un message envoyé change
 * le fil (son dernier message, son compteur de non-lus) ET la liste. Le mobile tenait deux racines
 * (`conversation` et `messages`) et devait donc invalider deux fois, en pensant à chaque fois aux
 * deux.
 */
export const messageKeys = {
  all: ["messages"] as const,
  /** Les fils du compte, à ce titre. `as` fait partie de la clé : un compte à double capacité a
   * des fils des DEUX côtés, et les confondre servirait à l'un le cache de l'autre (cf. `asKey`). */
  conversations: (as: CapabilityName | null) => ["messages", "conversations", asKey(as)] as const,
  /** Le fil avec UN athlète donné, résolu par get-or-create — côté coach. */
  conversationWith: (athleteId: string) => ["messages", "with", athleteId] as const,
  /** Le fil de l'athlète courant avec SON coach : aucun id à donner, l'API le résout. */
  myConversation: () => ["messages", "mine"] as const,
  /** Le contenu d'un fil dépend du titre : le scope tenant filtre sur `coachId` ou `athleteId`,
   * donc le même id ne rend pas la même chose selon le côté d'où on le lit. */
  thread: (conversationId: string, as: CapabilityName | null) =>
    ["messages", "thread", conversationId, asKey(as)] as const,
};

export type MessageApi = {
  /** Les fils existants, du plus récemment actif au plus ancien. Un athlète en a 0 ou 1. */
  listConversations: (as: CapabilityName | null) => Promise<ConversationDto[]>;
  /**
   * Get-or-create, idempotent. `athleteId` présent = ouverture côté coach (il cible un athlète) ;
   * absent = côté athlète, l'API résout son coach. Un seul appel pour les deux, parce que c'est
   * une seule route.
   */
  openConversation: (
    input: OpenConversationInput,
    as: CapabilityName | null,
  ) => Promise<ConversationDto>;
  getMessages: (conversationId: string, as: CapabilityName | null) => Promise<MessageDto[]>;
  sendMessage: (
    conversationId: string,
    input: SendMessageInput,
    as: CapabilityName | null,
  ) => Promise<MessageDto>;
  /** Marque lus les messages ENTRANTS du fil. 204, pas de corps. */
  markRead: (conversationId: string, as: CapabilityName | null) => Promise<void>;
  /**
   * Ticket d'upload (audio/image/vidéo) avant l'envoi direct vers le storage. Son MODE dicte la
   * forme de l'envoi : un PUT unique pour les fichiers courants, un envoi part par part suivi
   * d'une clôture au-delà du seuil (cf. `upload.schema.ts`).
   */
  requestUploadUrl: (
    conversationId: string,
    input: RequestMessageUploadUrlInput,
    as: CapabilityName | null,
  ) => Promise<MediaUploadTicketDto>;
  /**
   * Mode découpé UNIQUEMENT : recoller les parts en un objet. Tant que ce n'est pas fait, rien
   * n'existe dans le bucket — le message porterait un chemin vide.
   */
  completeMediaUpload: (
    conversationId: string,
    input: CompleteMultipartUploadInput,
    as: CapabilityName | null,
  ) => Promise<void>;
  /** Renoncer à un envoi découpé : sans quoi ses parts restent facturées, invisibles au bucket. */
  abortMediaUpload: (
    conversationId: string,
    input: AbortMultipartUploadInput,
    as: CapabilityName | null,
  ) => Promise<void>;
};

export function createMessageApi(api: ApiClient): MessageApi {
  return {
    listConversations: (as) => api.get<ConversationDto[]>(`/conversations${asQuery(as)}`),
    openConversation: (input, as) =>
      api.post<ConversationDto>(`/conversations${asQuery(as)}`, input),
    getMessages: (conversationId, as) =>
      api.get<MessageDto[]>(`/conversations/${conversationId}/messages${asQuery(as)}`),
    sendMessage: (conversationId, input, as) =>
      api.post<MessageDto>(`/conversations/${conversationId}/messages${asQuery(as)}`, input),
    // Corps vide explicite : sans lui le client n'envoie pas de Content-Type, et l'API refuse un
    // POST sans corps déclaré (même raison que `markAllRead` des notifications).
    markRead: (conversationId, as) =>
      api.post<void>(`/conversations/${conversationId}/read${asQuery(as)}`, {}),
    requestUploadUrl: (conversationId, input, as) =>
      api.post<MediaUploadTicketDto>(
        `/conversations/${conversationId}/messages/upload-url${asQuery(as)}`,
        input,
      ),
    completeMediaUpload: (conversationId, input, as) =>
      api.post<void>(
        `/conversations/${conversationId}/messages/upload/complete${asQuery(as)}`,
        input,
      ),
    abortMediaUpload: (conversationId, input, as) =>
      api.post<void>(`/conversations/${conversationId}/messages/upload/abort${asQuery(as)}`, input),
  };
}
