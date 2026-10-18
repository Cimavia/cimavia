import type { MessageDto, SendMessageInput } from "@cmv/shared";
import { FEEDBACK_EVENT_MESSAGE_TYPES, MessageType } from "@cmv/shared";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { ConversationParticipant, Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { assertKeyUnder } from "../../infra/storage/object-key";
import { StorageService } from "../../infra/storage/storage.service";
import { NotificationService } from "../../notification/notification.service";
import { AthletePlanService } from "../../plan/service/athlete-plan.service";
import { type CoachReadModel, coachesWhoRead } from "../../tenancy/coach-reads";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import {
  currentActor,
  exercisedOrThrow,
  type TenantContext,
} from "../../tenancy/tenant-context.type";
import { toMessageDto } from "../message.mapper";
import { ConversationService, type JoinedConversation } from "./conversation.service";
import { MessageAttachmentResolver } from "./message-attachment.resolver";
import { messageMediaKeyPrefix } from "./message-media.service";

// Rattachement résolu et validé, prêt à persister (ids possédés, ou null).
type ResolvedAttachment = { scheduledSessionId: string | null; sessionFeedbackId: string | null };

/**
 * Messages d'un fil : lecture, envoi (texte ou média), marquage lu. Le fil est toujours résolu via
 * ConversationService (scope tenant → 404 si l'acteur n'y participe pas).
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
    // Le « à propos de… » du message, résolu en lot et sous scope tenant.
    private readonly attachments: MessageAttachmentResolver,
    private readonly cls: ClsService,
    // Client de BASE, pour une seule lecture : ce que les AUTRES Coachs du fil lisent
    // (`coachesRead`).
    private readonly prisma: PrismaService,
  ) {}

  // Fil chronologique (du plus ancien au plus récent). Pas de pagination en MVP (dette P2-2) : le
  // volume d'un fil reste modeste ; à cursoriser si un fil devient très long.
  async listMessages(conversationId: string): Promise<MessageDto[]> {
    await this.conversations.getJoinedOrThrow(conversationId);
    const messages = await this.db.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    const attachments = await this.attachments.resolve(messages);
    return Promise.all(
      messages.map((message) =>
        toMessageDto(message, this.storage, attachments.get(message.id) ?? null),
      ),
    );
  }

  // Envoi d'un message (texte ou média déjà uploadé). Le média a transité par l'object storage via
  // une URL PUT signée ; ici on ne persiste que la clé + les métadonnées, jamais le binaire.
  async send(conversationId: string, input: SendMessageInput): Promise<MessageDto> {
    const conversation = await this.conversations.getJoinedOrThrow(conversationId);
    const actor = currentActor(this.cls);
    // La clé du média vient du client : elle doit désigner un objet de CE fil (#293).
    if (input.type !== MessageType.TEXT) {
      assertKeyUnder(messageMediaKeyPrefix(conversation.id), input.storagePath);
    }

    // Le message ouvre-t-il une SÉRIE chez ce destinataire ? Oui s'il a lu mon dernier message —
    // le passage « tout lu » → « non lu ». C'est le rythme de la trace (entrée de centre, e-mail),
    // pas celui du push (#537), et il se lit destinataire par destinataire (#611) : chacun lit à
    // son heure.
    //
    // Les AVIS de débrief ne comptent pas : posés au nom de l'athlète, ils restaient non lus chez
    // un coach qui travaille depuis la page Débriefs — et éteignaient le fil entier (#539).
    const latestFromMe = await this.db.message.findFirst({
      where: {
        conversationId,
        senderId: actor.userId,
        type: { notIn: [...FEEDBACK_EVENT_MESSAGE_TYPES] },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const opensSeries = (recipient: ConversationParticipant) =>
      latestFromMe == null ||
      (recipient.lastReadAt != null && recipient.lastReadAt >= latestFromMe.createdAt);

    const attachment = await this.resolveAttachment(conversation, actor, input);
    const data = buildMessageData(conversation.id, actor, input, attachment);
    const message = await this.db.$transaction(async (tx) => {
      const created = await tx.message.create({ data });
      // `lastMessageAt` sert au tri de la liste de fils, sans agréger les messages.
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });

    // Un push par message, comme dans une messagerie — sauf la suite d'un lot de médias : six
    // photos d'une même sélection font un push, celui de la première arrivée (#537).
    const push = input.type === MessageType.TEXT || input.continuesBatch !== true;
    const recipients = conversation.participants.filter((p) => p.userId !== actor.userId);
    // Les ids des destinataires viennent d'un fil DÉJÀ scopé (jamais du client) : sûrs pour le
    // NotificationService, qui lit ses tokens hors tenant. Un échec de push ne remonte pas ici.
    await Promise.all(
      recipients.map(async (recipient) => {
        const channels = { push, trace: opensSeries(recipient) };
        if (!channels.push && !channels.trace) return;
        await this.notifications.notifyMessageReceived(
          {
            recipientId: recipient.userId,
            senderId: actor.userId,
            conversationId: conversation.id,
          },
          channels,
        );
      }),
    );

    const attachments = await this.attachments.resolve([message]);
    return toMessageDto(message, this.storage, attachments.get(message.id) ?? null);
  }

  /**
   * Pose la marque de lecture de l'acteur (#611) sur le dernier message qu'il peut voir — pas sur
   * l'horloge du serveur : un message déjà daté mais pas encore validé, ou daté par une autre
   * instance, passerait pour lu sans avoir été montré. Idempotente, et jamais à reculons. Réarme la
   * trace : après lecture, le prochain message ouvre une nouvelle série chez lui.
   *
   * Le scope d'écriture ne touche que SA ligne (`userId` + titre) : les autres participants
   * gardent leur marque — chacun lit à son heure.
   */
  async markRead(conversationId: string): Promise<void> {
    await this.conversations.getJoinedOrThrow(conversationId);
    const latest = await this.db.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    // Rien à lire : la marque reste ce qu'elle est.
    if (latest == null) return;
    await this.db.conversationParticipant.updateMany({
      where: {
        conversationId,
        OR: [{ lastReadAt: null }, { lastReadAt: { lt: latest.createdAt } }],
      },
      data: { lastReadAt: latest.createdAt },
    });
  }

  /**
   * Valide le rattachement optionnel (« à propos de… ») : la FK n'impose pas le tenant, donc un id
   * entrant doit être prouvé lisible AVANT écriture. Deux gardes :
   * - la cible doit tenir au fil : TOUS ses participants la lisent (#611). Un athlète ne lit que
   *   ses séances — sa séance d'un autre athlète n'a rien à faire ici —, un Coach les siennes et
   *   celles d'un cycle qu'on lui ouvre (#607) ;
   * - côté athlète, une séance passe par AthletePlanService (filtre PUBLISHED) — le scope tenant,
   *   lui, laisserait référencer un brouillon du coach.
   */
  private async resolveAttachment(
    conversation: JoinedConversation,
    actor: TenantContext,
    input: SendMessageInput,
  ): Promise<ResolvedAttachment> {
    return {
      scheduledSessionId: await this.validateSession(
        conversation,
        actor,
        input.scheduledSessionId ?? null,
      ),
      sessionFeedbackId: await this.validateFeedback(
        conversation,
        actor,
        input.sessionFeedbackId ?? null,
      ),
    };
  }

  private async validateSession(
    conversation: JoinedConversation,
    actor: TenantContext,
    id: string | null,
  ): Promise<string | null> {
    if (id == null) return null;
    // Athlète : garde PUBLISHED (source unique). Coach : lecture scopée de SA séance.
    const session =
      exercisedOrThrow(actor) === "athlete"
        ? await this.athletePlans.getPublishedSessionOrThrow(id)
        : await this.db.scheduledSession.findFirst({ where: { id } });
    if (session == null) {
      throw new BadRequestException("Séance inconnue");
    }
    const inThread = await this.everyoneReads(conversation, actor, session, "ScheduledSession");
    if (!inThread) {
      throw new BadRequestException("Séance hors de ce fil");
    }
    return id;
  }

  private async validateFeedback(
    conversation: JoinedConversation,
    actor: TenantContext,
    id: string | null,
  ): Promise<string | null> {
    if (id == null) return null;
    // Un débrief n'existe que sur une séance PUBLISHED (créé via la garde P4) : la lecture scopée
    // suffit, pas de contrôle de statut à part.
    const feedback = await this.db.sessionFeedback.findFirst({ where: { id } });
    if (feedback == null) {
      throw new BadRequestException("Débrief inconnu");
    }
    // Un message rattaché à un débrief est une RÉPONSE à son athlète : il compte au « répondu » de
    // la boîte (#610) et s'affiche dans le débrief. Deux Coachs qui en parlent entre eux ne lui
    // répondent pas — le débrief ne se cite que là où il est.
    const withItsAthlete = conversation.participants.some(
      (p) => p.capability === "ATHLETE" && p.userId === feedback.athleteId,
    );
    if (!withItsAthlete) {
      throw new BadRequestException("Débrief hors de ce fil");
    }
    const inThread = await this.everyoneReads(conversation, actor, feedback, "SessionFeedback");
    if (!inThread) {
      throw new BadRequestException("Débrief hors de ce fil");
    }
    return id;
  }

  /**
   * Tous les participants lisent-ils la cible (#611) ? L'acteur, oui : la lecture scopée qui vient
   * de la trouver le prouve. Un athlète ne lit que les siennes — deux athlètes réunis ne peuvent
   * donc rien citer. Un AUTRE Coach, rien ne le dit : l'athlète lit tous ses cycles, et C ne lit pas
   * forcément ce que M partage. On relit alors la cible sous le filtre de chacun
   * (`coachesWhoRead`).
   */
  private async everyoneReads(
    conversation: JoinedConversation,
    actor: TenantContext,
    target: { id: string; athleteId: string | null },
    model: CoachReadModel,
  ): Promise<boolean> {
    const others = conversation.participants.filter((p) => p.userId !== actor.userId);
    const athletesRead = others
      .filter((p) => p.capability === "ATHLETE")
      .every((athlete) => athlete.userId === target.athleteId);
    if (!athletesRead) return false;

    const coachIds = others.filter((p) => p.capability === "COACH").map((p) => p.userId);
    if (coachIds.length === 0) return true;
    const readers = await coachesWhoRead(this.prisma, model, target.id, coachIds);
    return readers.length === coachIds.length;
  }
}

/**
 * Champs Prisma d'un message. `senderId` = l'auteur courant — l'extension l'injecte de toute façon,
 * le fil n'est que vérifié (#611). Le rattachement a déjà été validé (`resolveAttachment`) : on ne
 * persiste ici que des ids lisibles par tous, ou null.
 */
function buildMessageData(
  conversationId: string,
  actor: TenantContext,
  input: SendMessageInput,
  attachment: ResolvedAttachment,
): Prisma.MessageUncheckedCreateInput {
  const base = {
    conversationId,
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
