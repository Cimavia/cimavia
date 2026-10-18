import type {
  ConversationCandidatesDto,
  ConversationDto,
  CreateConversationInput,
} from "@cmv/shared";
import { MessageType, required } from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Conversation, ConversationParticipant, Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import { isUniqueViolation } from "../../infra/prisma/prisma-error";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor, type TenantContext } from "../../tenancy/tenant-context.type";
import {
  actorMemberOf,
  byName,
  type ConversationMember,
  conversationKindOf,
  directMembers,
  participantCapabilityOf,
  participantKeyOf,
  trainingCapabilityOf,
} from "../participant-key";
import { ConversationCandidateService } from "./conversation-candidate.service";

/** Une conversation et TOUS ses participants, l'acteur compris. */
export type JoinedConversation = Conversation & { participants: ConversationParticipant[] };

const iso = (date: Date | null) => date?.toISOString() ?? null;

/**
 * Conversations à participants (#611), à deux ou à plusieurs : l'acteur ne voit que celles où il
 * participe, AU TITRE qu'il exerce — la troisième forme de scope, par participation. Mêmes
 * participants, même conversation : `participantKey` en est l'unicité, capacités comprises.
 *
 * La vue dépend de qui interroge : `participants` nomme les autres, `lastReadAt` est la sienne.
 */
@Injectable()
export class ConversationService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly users: UserDirectoryService,
    private readonly candidates: ConversationCandidateService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Crée la conversation avec ces participants, ou rend celle qui les réunit déjà. Idempotent : le
   * client l'appelle à l'ouverture d'un fil pour obtenir un `conversationId` stable.
   *
   * Deux refus, deux états (#198). Se nommer soi-même est **impossible** — on ne s'écrit pas, et
   * l'auto-coaching n'a pas de lien : 409. Nommer quelqu'un que l'acteur ne peut pas réunir reste
   * un 400 « inconnu », qui dit vrai : un lien ABSENT, qui apparaîtra le jour où il existe.
   */
  async create(input: CreateConversationInput): Promise<ConversationDto> {
    const actor = currentActor(this.cls);
    const others = input.participants.map(
      (participant): ConversationMember => ({
        userId: participant.userId,
        capability: participantCapabilityOf(participant.capability),
      }),
    );
    if (others.some((other) => other.userId === actor.userId)) {
      throw new ConflictException("Tu ne peux pas ouvrir un fil avec toi-même");
    }
    if (!(await this.candidates.reachesAll(others))) {
      throw new BadRequestException("Participant inconnu");
    }

    const conversation = await this.ensureFor([actorMemberOf(actor), ...others]);
    const [dto] = await this.toDtos([conversation], actor);
    return required(dto, "[message] conversation créée mais non mappable");
  }

  /** Ceux que l'acteur peut réunir — le sélecteur de #612. */
  candidatesOf(): Promise<ConversationCandidatesDto> {
    return this.candidates.list();
  }

  /**
   * Conversations de l'acteur, de la plus récemment active à la plus ancienne : une conversation
   * sans message se range à sa création. Pas de pagination (cf. dette P2-2).
   */
  async list(): Promise<ConversationDto[]> {
    const actor = currentActor(this.cls);
    const conversations = await this.withParticipants(await this.db.conversation.findMany());
    const dtos = await this.toDtos(conversations, actor);
    const activity = (dto: ConversationDto) => dto.lastMessageAt ?? dto.createdAt;
    return dtos.sort((a, b) => activity(b).localeCompare(activity(a)));
  }

  /**
   * La conversation où l'acteur participe, ou 404. Point d'entrée du MessageService : le scope
   * tenant garantit qu'une conversation où il n'est pas ne remonte jamais.
   */
  async getJoinedOrThrow(conversationId: string): Promise<JoinedConversation> {
    const conversation = await this.db.conversation.findFirst({ where: { id: conversationId } });
    if (conversation == null) {
      throw new NotFoundException("Conversation introuvable");
    }
    const [joined] = await this.withParticipants([conversation]);
    return required(joined, `[message] conversation ${conversationId} sans participants`);
  }

  /** Le fil direct d'un Coach et d'un athlète, s'il existe — sans le créer. */
  findDirect(coachId: string, athleteId: string): Promise<JoinedConversation | null> {
    return this.findByKey(participantKeyOf(directMembers(coachId, athleteId)));
  }

  /**
   * Le fil direct d'un Coach et d'un athlète, créé s'il n'existe pas. Public parce que l'ouverture
   * par un utilisateur n'est pas le seul chemin : le serveur y pose aussi les avis de débrief (#96),
   * pour un athlète qui n'a peut-être jamais ouvert la messagerie.
   */
  ensure(coachId: string, athleteId: string): Promise<JoinedConversation> {
    return this.ensureFor(directMembers(coachId, athleteId));
  }

  /**
   * `findUnique` + `create` (l'`upsert` Prisma est interdit par le client tenant). La course entre
   * deux ouvertures simultanées est inoffensive : le second `create` viole `participantKey` (P2002)
   * → on relit la conversation déjà posée.
   *
   * L'extension n'admet la création que si l'acteur est parmi les participants, à son titre ; les
   * autres viennent de l'appelant, qui les a vérifiés (`create`) ou choisis (`ensure`).
   */
  private async ensureFor(members: readonly ConversationMember[]): Promise<JoinedConversation> {
    const participantKey = participantKeyOf(members);
    const existing = await this.findByKey(participantKey);
    if (existing != null) return existing;

    const data: Prisma.ConversationCreateInput = {
      kind: conversationKindOf(members),
      participantKey,
      participants: {
        create: members.map((member) => ({ userId: member.userId, capability: member.capability })),
      },
    };
    try {
      const [created] = await this.withParticipants([await this.db.conversation.create({ data })]);
      return required(created, "[message] conversation créée sans participants");
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.findByKey(participantKey);
        if (raced != null) return raced;
      }
      throw error;
    }
  }

  private async findByKey(participantKey: string): Promise<JoinedConversation | null> {
    const conversation = await this.db.conversation.findUnique({ where: { participantKey } });
    if (conversation == null) return null;
    const [joined] = await this.withParticipants([conversation]);
    return required(joined, `[message] conversation ${conversation.id} sans participants`);
  }

  /**
   * Les participants de ces conversations, en une requête scopée — pas un `include`, que
   * l'extension tenant ne filtre pas : elle ne voit que la requête de tête.
   */
  private async withParticipants(conversations: Conversation[]): Promise<JoinedConversation[]> {
    if (conversations.length === 0) return [];
    const participants = await this.db.conversationParticipant.findMany({
      where: { conversationId: { in: conversations.map((conversation) => conversation.id) } },
    });
    return conversations.map((conversation) => ({
      ...conversation,
      participants: participants.filter((p) => p.conversationId === conversation.id),
    }));
  }

  private async toDtos(
    conversations: JoinedConversation[],
    actor: TenantContext,
  ): Promise<ConversationDto[]> {
    if (conversations.length === 0) return [];
    const ids = conversations.map((conversation) => conversation.id);
    const mine = (conversation: JoinedConversation) =>
      required(
        conversation.participants.find((participant) => participant.userId === actor.userId),
        `[message] l'acteur ne participe pas à ${conversation.id}`,
      );

    // Dernier message de chaque fil (aperçu) : `distinct` garde la 1re ligne par conversation dans
    // l'ordre demandé — donc la plus récente.
    const lastMessages = await this.db.message.findMany({
      where: { conversationId: { in: ids } },
      orderBy: { createdAt: "desc" },
      distinct: ["conversationId"],
    });
    const lastByConversation = new Map(lastMessages.map((m) => [m.conversationId, m]));

    // Non-lus DU point de vue de l'acteur : les messages des autres, créés après SA marque de
    // lecture — tous, s'il n'a encore rien lu.
    const unread = await this.db.message.groupBy({
      by: ["conversationId"],
      where: {
        senderId: { not: actor.userId },
        OR: conversations.map((conversation) => {
          const lastReadAt = mine(conversation).lastReadAt;
          return lastReadAt == null
            ? { conversationId: conversation.id }
            : { conversationId: conversation.id, createdAt: { gt: lastReadAt } };
        }),
      },
      _count: { _all: true },
    });
    const unreadByConversation = new Map(
      unread.map((row) => [row.conversationId, row._count._all]),
    );

    // Un seul aller-retour pour les noms des autres (User est hors scope tenant).
    const others = (conversation: JoinedConversation) =>
      conversation.participants.filter((participant) => participant.userId !== actor.userId);
    const names = await this.users.namesByIds(
      conversations.flatMap((conversation) => others(conversation).map((p) => p.userId)),
    );

    return conversations.map((conversation) => {
      const last = lastByConversation.get(conversation.id) ?? null;
      const participants = others(conversation).map((participant) => ({
        userId: participant.userId,
        name: required(
          names.get(participant.userId),
          `[message] participant ${participant.userId} de ${conversation.id} sans nom`,
        ),
        capability: trainingCapabilityOf(participant.capability),
        lastReadAt: iso(participant.lastReadAt),
      }));
      return {
        id: conversation.id,
        kind: conversation.kind,
        participants: participants.sort(byName),
        lastReadAt: iso(mine(conversation).lastReadAt),
        lastMessageAt: iso(conversation.lastMessageAt),
        lastMessageSenderId: last?.senderId ?? null,
        lastMessageType: last?.type ?? null,
        // Aperçu = texte brut ; pour un média le client fabrique le libellé i18n depuis le type.
        lastMessagePreview: last?.type === MessageType.TEXT ? last.content : null,
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
        createdAt: conversation.createdAt.toISOString(),
      };
    });
  }
}
