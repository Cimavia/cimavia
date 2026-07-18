import type { MessageDto } from "@cmv/shared";
import type { Message } from "@prisma/client";
import type { StorageService } from "../infra/storage/storage.service";

/**
 * Un message porte SOIT du texte SOIT un média : la présence de `storagePath` tranche. Pour un
 * média, `fileName`/`mimeType`/`sizeBytes` sont toujours écrits ensemble — une absence signalerait
 * une incohérence de données, pas un cas métier : on lève plutôt que de combler par un défaut
 * (règle dure n°5). L'URL GET est signée, régénérée à chaque lecture (bucket privé).
 */
export async function toMessageDto(message: Message, storage: StorageService): Promise<MessageDto> {
  let media: MessageDto["media"] = null;
  if (message.storagePath != null) {
    if (message.fileName == null || message.mimeType == null || message.sizeBytes == null) {
      throw new Error(`[message] message média ${message.id} incomplet (métadonnées manquantes)`);
    }
    media = {
      url: await storage.createDownloadUrl(message.storagePath),
      fileName: message.fileName,
      mimeType: message.mimeType,
      sizeBytes: message.sizeBytes,
      durationSeconds: message.durationSeconds,
    };
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    content: message.content,
    media,
    scheduledSessionId: message.scheduledSessionId,
    sessionFeedbackId: message.sessionFeedbackId,
    readAt: message.readAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}
