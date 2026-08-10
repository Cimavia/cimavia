import type { UploadUrlDto } from "../dto/exercise.schema";
import type {
  ConversationDto,
  MessageDto,
  OpenConversationInput,
  RequestMessageUploadUrlInput,
  SendMessageInput,
} from "../dto/message.schema";
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
  /** Les fils du coach (un par athlète avec qui il a échangé). */
  conversations: () => ["messages", "conversations"] as const,
  /** Le fil avec UN athlète donné, résolu par get-or-create — côté coach. */
  conversationWith: (athleteId: string) => ["messages", "with", athleteId] as const,
  /** Le fil de l'athlète courant avec SON coach : aucun id à donner, l'API le résout. */
  myConversation: () => ["messages", "mine"] as const,
  thread: (conversationId: string) => ["messages", "thread", conversationId] as const,
};

export type MessageApi = {
  /** Les fils existants, du plus récemment actif au plus ancien. Un athlète en a 0 ou 1. */
  listConversations: () => Promise<ConversationDto[]>;
  /**
   * Get-or-create, idempotent. `athleteId` présent = ouverture côté coach (il cible un athlète) ;
   * absent = côté athlète, l'API résout son coach. Un seul appel pour les deux, parce que c'est
   * une seule route.
   */
  openConversation: (input: OpenConversationInput) => Promise<ConversationDto>;
  getMessages: (conversationId: string) => Promise<MessageDto[]>;
  sendMessage: (conversationId: string, input: SendMessageInput) => Promise<MessageDto>;
  /** Marque lus les messages ENTRANTS du fil. 204, pas de corps. */
  markRead: (conversationId: string) => Promise<void>;
  /** URL PUT signée (audio/image/vidéo) avant l'upload direct vers le storage. */
  requestUploadUrl: (
    conversationId: string,
    input: RequestMessageUploadUrlInput,
  ) => Promise<UploadUrlDto>;
};

export function createMessageApi(api: ApiClient): MessageApi {
  return {
    listConversations: () => api.get<ConversationDto[]>("/conversations"),
    openConversation: (input) => api.post<ConversationDto>("/conversations", input),
    getMessages: (conversationId) =>
      api.get<MessageDto[]>(`/conversations/${conversationId}/messages`),
    sendMessage: (conversationId, input) =>
      api.post<MessageDto>(`/conversations/${conversationId}/messages`, input),
    // Corps vide explicite : sans lui le client n'envoie pas de Content-Type, et l'API refuse un
    // POST sans corps déclaré (même raison que `markAllRead` des notifications).
    markRead: (conversationId) => api.post<void>(`/conversations/${conversationId}/read`, {}),
    requestUploadUrl: (conversationId, input) =>
      api.post<UploadUrlDto>(`/conversations/${conversationId}/messages/upload-url`, input),
  };
}
