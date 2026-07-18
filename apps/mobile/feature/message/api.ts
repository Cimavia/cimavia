import type {
  ConversationDto,
  MessageDto,
  RequestMessageUploadUrlInput,
  SendMessageInput,
  UploadUrlDto,
} from "@cmv/shared";
import { api } from "@/shared/lib/api";

// Clés de cache — persistées sur le disque (comme le reste, cf. lecture hors-ligne).
export const conversationKeys = {
  all: ["conversation"] as const,
  mine: () => ["conversation", "mine"] as const,
};

export const messageKeys = {
  all: ["messages"] as const,
  list: (conversationId: string) => ["messages", conversationId] as const,
};

// Get-or-create du fil de l'athlète courant : aucun champ, l'API résout SON coach. Idempotent.
export function openMyConversation(): Promise<ConversationDto> {
  return api.post<ConversationDto>("/conversations", {});
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
