import { randomUUID } from "node:crypto";
import type {
  AbortMultipartUploadInput,
  CompleteMultipartUploadInput,
  MediaUploadTicketDto,
  RequestMessageUploadUrlInput,
} from "@cmv/shared";
import {
  MULTIPART_PART_SIZE_BYTES,
  multipartPartSizes,
  requiresMultipart,
  UploadMode,
} from "@cmv/shared";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  MULTIPART_SIGNED_URL_TTL_SECONDS,
  SIGNED_URL_TTL_SECONDS,
  StorageService,
} from "../../infra/storage/storage.service";
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
   * Ticket d'upload. Mime, taille et durée sont validés en amont par le schéma (@cmv/shared) ; la
   * taille est en plus SIGNÉE dans l'URL (ContentLength) donc opposable par le storage. Le fil est
   * résolu par ConversationService → 404 si l'acteur n'en est pas participant.
   *
   * Le MODE est décidé par la seule taille : un PUT unique tant qu'elle passe le bord réseau, un
   * envoi découpé au-delà. Même arbitrage que le débrief, et pour la même raison d'infrastructure.
   *
   * Aucun message n'est créé ici : demander un ticket n'est pas envoyer (une capture abandonnée ne
   * laisse rien dans le fil). C'est l'envoi qui engage.
   */
  async createUploadUrl(
    conversationId: string,
    input: RequestMessageUploadUrlInput,
  ): Promise<MediaUploadTicketDto> {
    await this.conversations.getOwnedOrThrow(conversationId);

    const storagePath = buildMessageMediaKey(conversationId, input.fileName);
    if (!requiresMultipart(input.size)) {
      const uploadUrl = await this.storage.createUploadUrl(
        storagePath,
        input.mimeType,
        SIGNED_URL_TTL_SECONDS,
        input.size,
      );
      return {
        mode: UploadMode.SINGLE,
        uploadUrl,
        storagePath,
        expiresIn: SIGNED_URL_TTL_SECONDS,
      };
    }

    const partSizes = multipartPartSizes(input.size);
    // Inatteignable : le schéma a déjà borné `size` à un entier positif. On refuse franchement
    // plutôt que d'ouvrir un upload sans part, qui ne pourrait jamais être clos.
    if (partSizes == null) {
      throw new BadRequestException("Taille de fichier inexploitable");
    }

    const uploadId = await this.storage.createMultipartUpload(storagePath, input.mimeType);
    const partUrls = await this.storage.createPartUploadUrls(storagePath, uploadId, partSizes);
    return {
      mode: UploadMode.MULTIPART,
      storagePath,
      expiresIn: MULTIPART_SIGNED_URL_TTL_SECONDS,
      uploadId,
      partSize: MULTIPART_PART_SIZE_BYTES,
      partUrls,
    };
  }

  /** Recoller les parts. Le storage refuse en 409 s'il en manque une (cf. StorageService). */
  async completeUpload(conversationId: string, input: CompleteMultipartUploadInput): Promise<void> {
    await this.assertOwnedKey(conversationId, input.storagePath);
    await this.storage.completeMultipartUpload(input.storagePath, input.uploadId, input.partCount);
  }

  /** Renoncer à un envoi découpé et purger ses parts. */
  async abortUpload(conversationId: string, input: AbortMultipartUploadInput): Promise<void> {
    await this.assertOwnedKey(conversationId, input.storagePath);
    await this.storage.abortMultipartUpload(input.storagePath, input.uploadId);
  }

  /**
   * Le `storagePath` de la clôture vient du CLIENT — seule entrée de ce module qui désigne un objet
   * du bucket sans être construite par nous. Le tenancy guard protège la base, pas le storage :
   * sans cette garde, un participant pourrait clore un upload visant n'importe quelle clé.
   */
  private async assertOwnedKey(conversationId: string, storagePath: string): Promise<void> {
    await this.conversations.getOwnedOrThrow(conversationId);
    if (!storagePath.startsWith(messageMediaKeyPrefix(conversationId))) {
      throw new ForbiddenException("Ce chemin de storage n'appartient pas à cette conversation");
    }
  }
}

// Segment commun à tous les médias d'un fil. Extrait pour que la construction de la clé et sa
// VÉRIFICATION (assertOwnedKey) ne puissent pas diverger — deux littéraux se seraient
// désynchronisés au premier changement de segmentation, rendant la garde passante en silence.
function messageMediaKeyPrefix(conversationId: string): string {
  return `conversation/${conversationId}/`;
}

// Clé objet : segmentée par conversation, préfixe UUID contre les collisions de noms. Le nom de
// fichier est assaini (caractères sûrs uniquement), comme pour les documents et les médias.
function buildMessageMediaKey(conversationId: string, fileName: string): string {
  const safeName = fileName.replace(/[^\w.-]+/g, "_");
  return `${messageMediaKeyPrefix(conversationId)}${randomUUID()}-${safeName}`;
}
