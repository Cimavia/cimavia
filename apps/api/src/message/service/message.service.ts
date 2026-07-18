import type { MessageDto, SendMessageInput } from "@cmv/shared";
import { MessageType, Role } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Conversation, Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { StorageService } from "../../infra/storage/storage.service";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor, type TenantContext } from "../../tenancy/tenant-context.type";
import { toMessageDto } from "../message.mapper";
import { ConversationService } from "./conversation.service";

/**
 * Messages d'un fil : lecture, envoi (texte ou média), marquage lu. Le fil est toujours résolu via
 * ConversationService (scope tenant → 404 si le fil n'appartient pas à l'acteur).
 */
@Injectable()
export class MessageService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
    private readonly conversations: ConversationService,
    private readonly notifications: NotificationService,
    private readonly cls: ClsService,
  ) {}

  // Fil chronologique (du plus ancien au plus récent). Pas de pagination en MVP (dette P2-2) : le
  // volume d'un fil 1:1 reste modeste ; à cursoriser si un fil devient très long.
  async listMessages(conversationId: string): Promise<MessageDto[]> {
    await this.conversations.getOwnedOrThrow(conversationId);
    const messages = await this.db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    return Promise.all(messages.map((message) => toMessageDto(message, this.storage)));
  }

  // Envoi d'un message (texte ou média déjà uploadé). Le média a transité par l'object storage via
  // une URL PUT signée ; ici on ne persiste que la clé + les métadonnées, jamais le binaire.
  async send(conversationId: string, input: SendMessageInput): Promise<MessageDto> {
    const conversation = await this.conversations.getOwnedOrThrow(conversationId);
    const actor = currentActor(this.cls);

    // Throttle push (éviter une rafale de notifications) : on ne notifie que si le destinataire
    // n'a AUCUN message non lu de ma part dans ce fil — donc au passage « tout lu » → « non lu ».
    // Même philosophie que P4 (« seule la création d'un débrief notifie »).
    const unreadFromMe = await this.db.message.count({
      where: { conversationId, senderId: actor.userId, readAt: null },
    });

    const data = buildMessageData(conversation, actor, input);
    const message = await this.db.$transaction(async (tx) => {
      const created = await tx.message.create({ data });
      // `lastMessageAt` sert au tri de la liste de fils, sans agréger les messages.
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });

    if (unreadFromMe === 0) {
      const recipientId = actor.role === Role.COACH ? conversation.athleteId : conversation.coachId;
      // L'id du destinataire vient d'un fil DÉJÀ scopé (jamais du client) : sûr pour le
      // NotificationService, qui lit ses tokens hors tenant. Un échec de push ne remonte pas ici.
      await this.notifications.notifyMessageReceived({
        recipientId,
        senderId: actor.userId,
        conversationId: conversation.id,
      });
    }

    return toMessageDto(message, this.storage);
  }

  // Marque lus les messages ENTRANTS (envoyés par l'autre) encore non lus. Idempotent. Réarme le
  // throttle push : après lecture, le prochain message du fil re-notifiera.
  async markRead(conversationId: string): Promise<void> {
    await this.conversations.getOwnedOrThrow(conversationId);
    const actor = currentActor(this.cls);
    await this.db.message.updateMany({
      where: { conversationId, senderId: { not: actor.userId }, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

/**
 * Champs Prisma d'un message. Les deux champs tenant sont recopiés du fil (l'extension n'injecte
 * que celui de l'acteur), `senderId` = l'auteur courant.
 *
 * ⚠️ Le rattachement optionnel (séance/débrief) est volontairement ignoré ici tant que sa
 * validation « cible possédée + cycle PUBLISHED » n'est pas câblée (commit suivant) : persister un
 * id client sans contrôle contournerait le tenant (la FK n'impose rien).
 */
function buildMessageData(
  conversation: Conversation,
  actor: TenantContext,
  input: SendMessageInput,
): Prisma.MessageUncheckedCreateInput {
  const base = {
    coachId: conversation.coachId,
    athleteId: conversation.athleteId,
    conversationId: conversation.id,
    senderId: actor.userId,
    scheduledSessionId: null,
    sessionFeedbackId: null,
  };

  if (input.type === MessageType.TEXT) {
    return { ...base, type: input.type, content: input.content };
  }

  return {
    ...base,
    type: input.type,
    storagePath: input.storagePath,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.size,
    // L'image n'a pas de durée ; l'audio et la vidéo, oui (déclarée par le client — cf. P4-2).
    durationSeconds: input.type === MessageType.IMAGE ? null : input.durationSeconds,
  };
}
