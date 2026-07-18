import { randomUUID } from "node:crypto";
import type { RequestMessageUploadUrlInput, UploadUrlDto } from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { SIGNED_URL_TTL_SECONDS, StorageService } from "../../infra/storage/storage.service";
import { ConversationService } from "./conversation.service";

/**
 * Médias d'un message (audio/image/vidéo). Même flux que les médias de débrief : URL PUT signée →
 * upload direct du client vers le storage → envoi du message qui référence la clé. Le binaire ne
 * transite jamais par l'API.
 *
 * Deux différences avec le débrief :
 * - aucun quota (un fil n'a pas de plafond de médias, contrairement aux 3 vidéos / 5 photos d'un
 *   débrief) ;
 * - la clé est segmentée par CONVERSATION (le fichier appartient au fil, partagé par les deux
 *   parties), pas par athlète.
 */
@Injectable()
export class MessageMediaService {
  constructor(
    private readonly storage: StorageService,
    private readonly conversations: ConversationService,
  ) {}

  /**
   * URL PUT signée. Mime, taille et durée sont validés en amont par le schéma (@cmv/shared) ; la
   * taille est en plus SIGNÉE dans l'URL (ContentLength) donc opposable par le storage. Le fil est
   * résolu par ConversationService → 404 si l'acteur n'en est pas participant.
   *
   * Aucun message n'est créé ici : demander une URL n'est pas envoyer (une capture abandonnée ne
   * laisse rien dans le fil). C'est l'envoi qui engage.
   */
  async createUploadUrl(
    conversationId: string,
    input: RequestMessageUploadUrlInput,
  ): Promise<UploadUrlDto> {
    await this.conversations.getOwnedOrThrow(conversationId);

    const storagePath = buildMessageMediaKey(conversationId, input.fileName);
    const uploadUrl = await this.storage.createUploadUrl(
      storagePath,
      input.mimeType,
      SIGNED_URL_TTL_SECONDS,
      input.size,
    );
    return { uploadUrl, storagePath, expiresIn: SIGNED_URL_TTL_SECONDS };
  }
}

// Clé objet : segmentée par conversation, préfixe UUID contre les collisions de noms. Le nom de
// fichier est assaini (caractères sûrs uniquement), comme pour les documents et les médias.
function buildMessageMediaKey(conversationId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.-]+/g, "_");
  return `conversation/${conversationId}/${randomUUID()}-${safeName}`;
}
