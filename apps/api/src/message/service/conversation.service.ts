import type { ConversationDto, OpenConversationInput } from "@cmv/shared";
import { CoachAthleteStatus, MessageType, required } from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { type Conversation, Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import {
  currentActor,
  exercisedOrThrow,
  type TenantContext,
} from "../../tenancy/tenant-context.type";

/**
 * Fil 1:1 coach ↔ athlète (CDC §5.8). Les DEUX rôles lisent et écrivent : le tenancy layer scope
 * par `coachId` OU `athleteId` selon l'acteur, et l'unicité `[coachId, athleteId]` garantit un
 * seul fil par relation — un athlète suivi par plusieurs coachs a donc un fil avec chacun (#599).
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
   * un de SES coachs.
   */
  async open(input: OpenConversationInput): Promise<ConversationDto> {
    const actor = currentActor(this.cls);
    const { coachId, athleteId } = await this.resolvePair(actor, input);
    const conversation = await this.ensure(coachId, athleteId);
    const [dto] = await this.toDtos([conversation], actor);
    return required(dto, "[message] conversation ouverte mais non mappable");
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
   * Résout le couple (coach, athlète) du fil selon l'acteur. La FK n'impose pas le tenant : on
   * VÉRIFIE que l'autre bout est bien lié à l'acteur (relation active), dans les deux sens — le
   * coach vise un de SES athlètes, l'athlète un de SES coachs (#599). Un athlète autonome (0 coach)
   * n'a pas de messagerie.
   *
   * Trois refus, et trois ÉTATS distincts (#198). Se viser soi-même est **impossible** : le CHECK
   * `coach_athlete_not_self` (#11) interdit la relation, donc aucune requête ne pourra jamais la
   * trouver — c'est un 409, le même que le refus d'auto-relation, et pour la même raison. Viser un
   * tiers qui n'est pas lié reste un 400 « inconnu », qui dit vrai — l'athlète sans coach compris :
   * une relation ABSENTE, pas une relation impossible, qui apparaîtra le jour où il en rejoint un.
   */
  private async resolvePair(
    actor: TenantContext,
    input: OpenConversationInput,
  ): Promise<{ coachId: string; athleteId: string }> {
    if (exercisedOrThrow(actor) === "coach") {
      if (input.athleteId == null) {
        throw new BadRequestException("athleteId requis pour ouvrir un fil");
      }
      await this.assertLinked(actor, { athleteId: input.athleteId }, "Athlète inconnu");
      return { coachId: actor.userId, athleteId: input.athleteId };
    }

    // L'athlète a 0..N coachs (#599) : sans désigner lequel, il n'y a pas de fil à résoudre.
    if (input.coachId == null) {
      throw new BadRequestException("coachId requis pour ouvrir un fil");
    }
    await this.assertLinked(actor, { coachId: input.coachId }, "Coach inconnu");
    return { coachId: input.coachId, athleteId: actor.userId };
  }

  /**
   * L'autre bout du fil est-il lié à l'acteur ? Le filtre tenant ajoute l'acteur à sa colonne
   * (`coachId` ou `athleteId` selon la capacité) : il ne reste qu'à nommer l'autre.
   *
   * Soi-même AVANT la relation, et pas à la place du `null` qu'elle rendrait : chercher `moi` dans
   * l'autre colonne ne peut rien trouver, et le refus tomberait en « inconnu » — un état faux.
   * L'autre bout est parfaitement connu, c'est soi.
   */
  private async assertLinked(
    actor: TenantContext,
    other: { athleteId: string } | { coachId: string },
    unknown: string,
  ): Promise<void> {
    if (Object.values(other).includes(actor.userId)) {
      throw new ConflictException("Tu ne peux pas ouvrir un fil avec toi-même");
    }
    const relation = await this.db.coachAthlete.findFirst({
      where: { ...other, status: CoachAthleteStatus.ACTIVE },
    });
    if (relation == null) {
      throw new BadRequestException(unknown);
    }
  }

  /**
   * Le fil d'une relation, créé s'il n'existe pas. Public parce que l'ouverture par un utilisateur
   * n'est plus le seul chemin : le serveur y pose aussi les avis de débrief (#96), pour un athlète
   * qui n'a peut-être jamais ouvert la messagerie — donc dont le fil n'existe pas encore.
   *
   * `findFirst` + `create` (l'`upsert` Prisma est interdit par le client tenant). La course entre
   * deux ouvertures simultanées est inoffensive : le second `create` viole `[coachId, athleteId]`
   * (P2002) → on relit le fil déjà posé.
   */
  async ensure(coachId: string, athleteId: string): Promise<Conversation> {
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
    const asCoach = exercisedOrThrow(actor) === "coach";
    const counterpartId = (conversation: Conversation) =>
      asCoach ? conversation.athleteId : conversation.coachId;

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
      const name = required(
        names.get(otherId),
        `[message] fil ${conversation.id} sans contrepartie résolue`,
      );
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
