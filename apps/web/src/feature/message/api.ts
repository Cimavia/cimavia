import type {
  ConversationDto,
  MessageDto,
  OpenConversationInput,
  RequestMessageUploadUrlInput,
  SendMessageInput,
  UploadUrlDto,
} from "@cmv/shared";
import { api } from "@/shared/lib/api";

export const messageKeys = {
  all: ["messages"] as const,
  conversations: () => ["messages", "conversations"] as const,
  conversationWith: (athleteId: string) => ["messages", "with", athleteId] as const,
  thread: (conversationId: string) => ["messages", "thread", conversationId] as const,
};

// Fils existants du coach (un par athlète avec qui il a échangé), du plus récent au plus ancien.
export function listConversations(): Promise<ConversationDto[]> {
  return api.get<ConversationDto[]>("/conversations");
}

// Get-or-create : ouvre le fil avec un athlète. Idempotent.
export function openConversation(input: OpenConversationInput): Promise<ConversationDto> {
  return api.post<ConversationDto>("/conversations", input);
}

export function getMessages(conversationId: string): Promise<MessageDto[]> {
  return api.get<MessageDto[]>(`/conversations/${conversationId}/messages`);
}

export function sendMessage(conversationId: string, input: SendMessageInput): Promise<MessageDto> {
  return api.post<MessageDto>(`/conversations/${conversationId}/messages`, input);
}

// Marque lus les messages entrants du fil (204, pas de corps).
export function markConversationRead(conversationId: string): Promise<void> {
  return api.post<void>(`/conversations/${conversationId}/read`, {});
}

// Média : URL PUT signée (audio/image/vidéo) avant l'upload direct vers le storage.
export function requestMessageUploadUrl(
  conversationId: string,
  input: RequestMessageUploadUrlInput,
): Promise<UploadUrlDto> {
  return api.post<UploadUrlDto>(`/conversations/${conversationId}/messages/upload-url`, input);
}
