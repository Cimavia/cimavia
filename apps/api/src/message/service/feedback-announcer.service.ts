import { FEEDBACK_EVENT_MESSAGE_TYPES, MessageType } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, SessionFeedback } from "@prisma/client";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { ConversationService } from "./conversation.service";

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
   * Annonce une activité sur ce débrief — dépôt ou complément, l'appelant n'a pas à le dire.
   *
   * C'est l'ÉTAT du fil qui tranche, et c'est ce qui empêche vingt photos de faire vingt bulles :
   *
   * - aucun avis pour ce débrief → « déposé » ;
   * - un avis déjà là, **non lu** → rien. Un second pointeur vers le même débrief n'apprend rien
   *   de plus que le premier, qui pointe déjà l'état courant ;
   * - tous les avis lus → « mis à jour », qui est cette fois une information neuve.
   *
   * Même règle que le throttle push « first-unread » de `MessageService.send`, et que « seule la
   * création d'un débrief notifie » (P4). Elle DOIT porter sur l'état et non sur la requête :
   * `attach` est appelé une fois par média, le serveur ne voit jamais « un lot de vingt ».
   *
   * Conséquence assumée : `markRead` est par FIL (tranché en #190), donc un coach qui ne lit que la
   * page Débriefs laisse son avis non lu et n'en reçoit pas d'autre pour ce débrief. Rien n'est
   * perdu — l'avis qu'il a pointe déjà l'état courant.
   */
  async announce(feedback: SessionFeedback): Promise<void> {
    try {
      const events = await this.db.message.findMany({
        where: {
          sessionFeedbackId: feedback.id,
          type: { in: [...FEEDBACK_EVENT_MESSAGE_TYPES] },
        },
        select: { readAt: true },
      });
      if (events.some((event) => event.readAt == null)) return;

      const type =
        events.length === 0 ? MessageType.FEEDBACK_CREATED : MessageType.FEEDBACK_UPDATED;
      await this.post(feedback, type);
    } catch (error) {
      // Un avis manqué ne doit pas faire échouer le débrief : l'athlète a écrit son retour, c'est
      // ça la donnée. Et la règle étant portée par l'ÉTAT, le prochain geste répare tout seul —
      // un dépôt non annoncé retrouve zéro avis, donc réémet « déposé ».
      this.logger.error(
        { event: "feedback.announce.failed", sessionFeedbackId: feedback.id, error },
        "Avis de débrief non posé",
      );
    }
  }

  private async post(feedback: SessionFeedback, type: MessageType): Promise<void> {
    // Le fil peut ne pas exister : un athlète peut débriefer sans avoir jamais ouvert la messagerie.
    const conversation = await this.conversations.ensure(feedback.coachId, feedback.athleteId);

    // Les deux champs tenant sont recopiés du fil (l'extension n'injecte que celui de l'acteur), et
    // l'auteur est l'ATHLÈTE : c'est son geste qu'on annonce, et c'est ce qui aligne la bulle du
    // bon côté chez les deux. Ni contenu ni média — le type porte tout le sens.
    const data: Prisma.MessageUncheckedCreateInput = {
      coachId: conversation.coachId,
      athleteId: conversation.athleteId,
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
