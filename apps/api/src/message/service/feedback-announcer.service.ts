import { FEEDBACK_EVENT_MESSAGE_TYPES, MessageType, required } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, SessionFeedback } from "@prisma/client";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { ConversationService, type JoinedConversation } from "./conversation.service";

/**
 * L'avis posé dans le fil quand l'athlète dépose ou complète un débrief (#96).
 *
 * Le coach travaille depuis la page Débriefs, mais c'est dans la messagerie qu'il revient : un
 * débrief déposé n'y laissait aucune trace, et il fallait penser à changer d'écran pour le savoir.
 *
 * L'avis ne recopie RIEN du débrief — ni le texte, ni les médias. Il porte un `sessionFeedbackId`,
 * dont la puce « À propos du débrief : … » fait un lien. C'est ce qui le rend inusable : dix photos
 * ajoutées après coup ne le périment pas, il ouvre toujours l'état courant. Recopier les médias en
 * messages, l'autre voie possible, donnerait deux propriétaires au même objet S3 — la famille de
 * dette #67/#72 qu'on passe déjà du temps à réduire.
 */
@Injectable()
export class FeedbackAnnouncerService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly conversations: ConversationService,
    @InjectPinoLogger(FeedbackAnnouncerService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Annonce une activité sur ce débrief à chacun de ces Coachs, dans SON fil direct avec l'athlète
   * (#610) — dépôt ou complément, l'appelant n'a pas à le dire. Jamais dans une conversation à
   * plusieurs : chacun lit l'avis à son heure, et sa lecture ne vaut que pour lui.
   *
   * C'est l'ÉTAT du fil qui tranche, et c'est ce qui empêche vingt photos de faire vingt bulles :
   *
   * - aucun avis pour ce débrief dans ce fil → « déposé » ;
   * - un avis déjà là, **non lu** du Coach — créé après sa marque de lecture (#611) → rien. Un second pointeur vers le même débrief n'apprend rien
   *   de plus que le premier, qui pointe déjà l'état courant ;
   * - tous les avis lus → « mis à jour », qui est cette fois une information neuve.
   *
   * Même rythme que la trace des messages (`MessageService.send`) : une par série non lue. Le
   * push, lui, suit son propre rythme depuis #537 — c'est `FeedbackService.markSent` qui le
   * décide. Cette règle-ci DOIT porter sur l'état et non sur la requête : `attach` est appelé une
   * fois par média, le serveur ne voit jamais « un lot de vingt ».
   *
   * Conséquence assumée : `markRead` est par FIL (tranché en #190), donc un coach qui ne lit que la
   * page Débriefs laisse son avis non lu et n'en reçoit pas d'autre pour ce débrief. Rien n'est
   * perdu — l'avis qu'il a pointe déjà l'état courant.
   *
   * `coachIds` exclut l'athlète (`FeedbackAudienceService`, #316) : on ne s'ouvre pas de fil avec
   * soi-même.
   */
  async announce(feedback: SessionFeedback, coachIds: readonly string[]): Promise<void> {
    // Chacun dans son propre filet : le fil de M injoignable ne prive pas C de son avis. Les fils
    // sont distincts — un par couple —, rien ne s'y croise.
    await Promise.all(coachIds.map((coachId) => this.announceTo(feedback, coachId)));
  }

  private async announceTo(feedback: SessionFeedback, coachId: string): Promise<void> {
    try {
      // Le fil peut ne pas exister : un athlète peut débriefer sans avoir jamais écrit à ce Coach.
      // On ne le crée qu'au moment d'écrire — se taire ne doit rien ouvrir.
      const existing = await this.conversations.findDirect(coachId, feedback.athleteId);
      const events = existing == null ? [] : await this.eventsOf(existing, feedback);
      const coachReadAt =
        existing == null
          ? null
          : required(
              existing.participants.find((participant) => participant.userId === coachId),
              `[message] le Coach ${coachId} absent de son fil direct ${existing.id}`,
            ).lastReadAt;
      const unread = (event: { createdAt: Date }) =>
        coachReadAt == null || event.createdAt > coachReadAt;
      if (events.some(unread)) return;

      const type =
        events.length === 0 ? MessageType.FEEDBACK_CREATED : MessageType.FEEDBACK_UPDATED;
      const conversation =
        existing ?? (await this.conversations.ensure(coachId, feedback.athleteId));
      await this.post(feedback, conversation, type);
    } catch (error) {
      // Un avis manqué ne doit pas faire échouer le débrief : l'athlète a écrit son retour, c'est
      // ça la donnée. Et la règle étant portée par l'ÉTAT, le prochain geste répare tout seul —
      // un dépôt non annoncé retrouve zéro avis, donc réémet « déposé ».
      this.logger.error(
        { event: "feedback.announce.failed", sessionFeedbackId: feedback.id, coachId, err: error },
        "Avis de débrief non posé",
      );
    }
  }

  private eventsOf(
    conversation: JoinedConversation,
    feedback: SessionFeedback,
  ): Promise<{ createdAt: Date }[]> {
    return this.db.message.findMany({
      where: {
        conversationId: conversation.id,
        sessionFeedbackId: feedback.id,
        type: { in: [...FEEDBACK_EVENT_MESSAGE_TYPES] },
      },
      select: { createdAt: true },
    });
  }

  private async post(
    feedback: SessionFeedback,
    conversation: JoinedConversation,
    type: MessageType,
  ): Promise<void> {
    // L'auteur est l'ATHLÈTE : c'est son geste qu'on annonce, et c'est ce qui aligne la bulle du
    // bon côté chez les deux. Ni contenu ni média — le type porte tout le sens.
    const data: Prisma.MessageUncheckedCreateInput = {
      conversationId: conversation.id,
      senderId: feedback.athleteId,
      type,
      sessionFeedbackId: feedback.id,
    };

    await this.db.$transaction(async (tx) => {
      const created = await tx.message.create({ data });
      // `lastMessageAt` sert au tri de la liste de fils : un avis remonte le fil comme un message,
      // sinon un débrief déposé resterait en bas de la liste du coach.
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: created.createdAt },
      });
    });
  }
}
