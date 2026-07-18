import type { ConversationDto, OpenConversationInput } from "@cmv/shared";
import { CoachAthleteStatus, MessageType, Role } from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Conversation, Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { currentActor, type TenantContext } from "../../tenancy/tenant-context.type";

/**
 * Fil 1:1 coach ↔ athlète (CDC §5.8). Les DEUX rôles lisent et écrivent : le tenancy layer scope
 * par `coachId` OU `athleteId` selon l'acteur, et l'unicité `[coachId, athleteId]` garantit un
 * seul fil par relation.
 *
 * La contrepartie (l'autre partie du fil) dépend de qui interroge : elle est résolue à partir de
 * l'acteur courant, lu dans le CLS — la conversation elle-même est symétrique.
 */
@Injectable()
export class ConversationService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly users: UserDirectoryService,
    private readonly cls: ClsService,
  ) {}

  /**
   * Ouvre le fil et le crée s'il n'existe pas. Idempotent : le client l'appelle à chaque ouverture
   * d'écran pour obtenir un `conversationId` stable. Coach → cible un de SES athlètes ; athlète →
   * son coach (aucun champ, la relation est résolue).
   */
  async open(input: OpenConversationInput): Promise<ConversationDto> {
    const actor = currentActor(this.cls);
    const { coachId, athleteId } = await this.resolvePair(actor, input.athleteId);
    const conversation = await this.getOrCreate(coachId, athleteId);
    const [dto] = await this.toDtos([conversation], actor);
    if (dto == null) {
      throw new Error("[message] conversation ouverte mais non mappable");
    }
    return dto;
  }

  // Fils existants, du plus récemment actif au plus ancien (l'ordre utile au coach). Pas de
  // pagination (cf. dette P2-2) — un coach a des dizaines d'athlètes, pas des milliers.
  async list(): Promise<ConversationDto[]> {
    const actor = currentActor(this.cls);
    const conversations = await this.db.conversation.findMany({
      orderBy: { lastMessageAt: "desc" },
    });
    return this.toDtos(conversations, actor);
  }

  // La conversation possédée par l'acteur courant, ou 404. Point d'entrée du MessageService : le
  // scope tenant garantit qu'un fil d'un autre tenant ne remonte jamais.
  async getOwnedOrThrow(conversationId: string): Promise<Conversation> {
    const conversation = await this.db.conversation.findFirst({ where: { id: conversationId } });
    if (conversation == null) {
      throw new NotFoundException("Conversation introuvable");
    }
    return conversation;
  }

  /**
   * Résout le couple (coach, athlète) du fil selon l'acteur. La FK n'impose pas le tenant : côté
   * coach, on VÉRIFIE que l'athlète visé est bien l'un des siens (relation active). Côté athlète,
   * on lit sa relation scopée — un athlète autonome (0 coach) n'a pas de messagerie en MVP.
   */
  private async resolvePair(
    actor: TenantContext,
    athleteId: string | undefined,
  ): Promise<{ coachId: string; athleteId: string }> {
    if (actor.role === Role.COACH) {
      if (athleteId == null) {
        throw new BadRequestException("athleteId requis pour ouvrir un fil");
      }
      const relation = await this.db.coachAthlete.findFirst({
        where: { athleteId, status: CoachAthleteStatus.ACTIVE },
      });
      if (relation == null) {
        throw new BadRequestException("Athlète inconnu");
      }
      return { coachId: actor.userId, athleteId };
    }

    const relation = await this.db.coachAthlete.findFirst({
      where: { status: CoachAthleteStatus.ACTIVE },
    });
    if (relation == null) {
      throw new BadRequestException("Aucun coach : pas de messagerie");
    }
    return { coachId: relation.coachId, athleteId: actor.userId };
  }

  /**
   * `findFirst` + `create` (l'`upsert` Prisma est interdit par le client tenant). La course entre
   * deux ouvertures simultanées est inoffensive : le second `create` viole `[coachId, athleteId]`
   * (P2002) → on relit le fil déjà posé.
   */
  private async getOrCreate(coachId: string, athleteId: string): Promise<Conversation> {
    const existing = await this.db.conversation.findFirst({ where: { coachId, athleteId } });
    if (existing != null) return existing;

    try {
      // Les deux champs tenant sont fournis explicitement (l'extension n'injecte que celui de
      // l'acteur) — même dénormalisation que PlanWeek / le débrief.
      return await this.db.conversation.create({ data: { coachId, athleteId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.db.conversation.findFirst({ where: { coachId, athleteId } });
        if (raced != null) return raced;
      }
      throw error;
    }
  }

  private async toDtos(
    conversations: Conversation[],
    actor: TenantContext,
  ): Promise<ConversationDto[]> {
    if (conversations.length === 0) return [];
    const ids = conversations.map((conversation) => conversation.id);
    const counterpartId = (conversation: Conversation) =>
      actor.role === Role.COACH ? conversation.athleteId : conversation.coachId;

    // Dernier message de chaque fil (aperçu) : `distinct` garde la 1re ligne par conversation dans
    // l'ordre demandé — donc la plus récente.
    const lastMessages = await this.db.message.findMany({
      where: { conversationId: { in: ids } },
      orderBy: { createdAt: "desc" },
      distinct: ["conversationId"],
    });
    const lastByConversation = new Map(lastMessages.map((m) => [m.conversationId, m]));

    // Non-lus DU point de vue de l'acteur : messages entrants (envoyés par l'autre) sans `readAt`.
    const unread = await this.db.message.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: ids }, readAt: null, senderId: { not: actor.userId } },
      _count: { _all: true },
    });
    const unreadByConversation = new Map(
      unread.map((row) => [row.conversationId, row._count._all]),
    );

    // Un seul aller-retour pour les noms de contrepartie (User est hors scope tenant).
    const names = await this.users.namesByIds(conversations.map(counterpartId));

    return conversations.map((conversation) => {
      const otherId = counterpartId(conversation);
      const name = names.get(otherId);
      if (name == null) {
        throw new Error(`[message] fil ${conversation.id} sans contrepartie résolue`);
      }
      const last = lastByConversation.get(conversation.id) ?? null;
      return {
        id: conversation.id,
        counterpartId: otherId,
        counterpartName: name,
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        lastMessageType: last?.type ?? null,
        // Aperçu = texte brut ; pour un média le client fabrique le libellé i18n depuis le type.
        lastMessagePreview: last?.type === MessageType.TEXT ? last.content : null,
        unreadCount: unreadByConversation.get(conversation.id) ?? 0,
      };
    });
  }
}
