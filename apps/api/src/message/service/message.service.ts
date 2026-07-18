import type { MessageDto, SendMessageInput } from "@cmv/shared";
import { MessageType, Role } from "@cmv/shared";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Conversation, Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { StorageService } from "../../infra/storage/storage.service";
import { NotificationService } from "../../notification/notification.service";
import { AthletePlanService } from "../../plan/service/athlete-plan.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor, type TenantContext } from "../../tenancy/tenant-context.type";
import { toMessageDto } from "../message.mapper";
import { ConversationService } from "./conversation.service";

// Rattachement résolu et validé, prêt à persister (ids possédés, ou null).
type ResolvedAttachment = { scheduledSessionId: string | null; sessionFeedbackId: string | null };

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
    // Garde « séance de l'athlète courant, dans un cycle PUBLISHED » — source unique (P3), pour
    // valider un rattachement côté athlète (le scope tenant ne filtre pas le statut).
    private readonly athletePlans: AthletePlanService,
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

    const attachment = await this.resolveAttachment(conversation, actor, input);
    const data = buildMessageData(conversation, actor, input, attachment);
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

  /**
   * Valide le rattachement optionnel (« à propos de… ») : la FK n'impose pas le tenant, donc un id
   * entrant doit être prouvé possédé AVANT écriture. Deux gardes :
   * - la cible doit appartenir à la MÊME relation que le fil (un coach a N athlètes : sa séance
   *   d'un autre athlète n'a rien à faire ici) ;
   * - côté athlète, une séance passe par AthletePlanService (filtre PUBLISHED) — le scope tenant,
   *   lui, laisserait référencer un brouillon du coach.
   */
  private async resolveAttachment(
    conversation: Conversation,
    actor: TenantContext,
    input: SendMessageInput,
  ): Promise<ResolvedAttachment> {
    return {
      scheduledSessionId: await this.validateSession(
        conversation,
        actor,
        input.scheduledSessionId ?? null,
      ),
      sessionFeedbackId: await this.validateFeedback(conversation, input.sessionFeedbackId ?? null),
    };
  }

  private async validateSession(
    conversation: Conversation,
    actor: TenantContext,
    id: string | null,
  ): Promise<string | null> {
    if (id == null) return null;
    // Athlète : garde PUBLISHED (source unique). Coach : lecture scopée de SA séance.
    const session =
      actor.role === Role.ATHLETE
        ? await this.athletePlans.getPublishedSessionOrThrow(id)
        : await this.db.scheduledSession.findFirst({ where: { id } });
    if (session == null) {
      throw new BadRequestException("Séance inconnue");
    }
    if (session.coachId !== conversation.coachId || session.athleteId !== conversation.athleteId) {
      throw new BadRequestException("Séance hors de ce fil");
    }
    return id;
  }

  private async validateFeedback(
    conversation: Conversation,
    id: string | null,
  ): Promise<string | null> {
    if (id == null) return null;
    // Un débrief n'existe que sur une séance PUBLISHED (créé via la garde P4) : la lecture scopée
    // suffit, pas de contrôle de statut à part.
    const feedback = await this.db.sessionFeedback.findFirst({ where: { id } });
    if (feedback == null) {
      throw new BadRequestException("Débrief inconnu");
    }
    if (
      feedback.coachId !== conversation.coachId ||
      feedback.athleteId !== conversation.athleteId
    ) {
      throw new BadRequestException("Débrief hors de ce fil");
    }
    return id;
  }
}

/**
 * Champs Prisma d'un message. Les deux champs tenant sont recopiés du fil (l'extension n'injecte
 * que celui de l'acteur), `senderId` = l'auteur courant. Le rattachement a déjà été validé
 * (`resolveAttachment`) : on ne persiste ici que des ids possédés, ou null.
 */
function buildMessageData(
  conversation: Conversation,
  actor: TenantContext,
  input: SendMessageInput,
  attachment: ResolvedAttachment,
): Prisma.MessageUncheckedCreateInput {
  const base = {
    coachId: conversation.coachId,
    athleteId: conversation.athleteId,
    conversationId: conversation.id,
    senderId: actor.userId,
    scheduledSessionId: attachment.scheduledSessionId,
    sessionFeedbackId: attachment.sessionFeedbackId,
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
