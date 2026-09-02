import type { MessageAttachmentDto } from "@cmv/shared";
import { MessageAttachmentType } from "@cmv/shared";
import { Inject, Injectable } from "@nestjs/common";
import type { Message } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toIsoDate } from "../../util/date.util";

/** Le strict nécessaire pour composer un libellé — jamais la séance entière. */
type SessionLabel = { title: string; scheduledDate: Date };

/**
 * Le « à propos de… » d'un message, résolu à la lecture.
 *
 * Deux règles, et elles ne sont pas des préférences de style :
 *
 * 1. **Requêtes scopées à part, jamais un `include` imbriqué.** Un `include` échappe au scope
 *    tenant (piège n°2 du multi-tenant) : la cible d'un rattachement remonterait sans être
 *    filtrée, et un libellé fuirait hors de sa relation — sans erreur, sans trace. Ici la cible
 *    est relue par le client tenant, donc un id qu'on n'a pas le droit de lire ne rend rien et le
 *    message redevient une bulle ordinaire.
 * 2. **En lot.** Un fil peut compter des centaines de messages ; une requête par message ferait
 *    du rendu d'un fil un problème de base de données.
 *
 * Le libellé lui-même n'est PAS produit ici : l'API ne rend aucune string. Elle rend le titre de
 * la séance et sa date, le client compose (même règle que `lastMessageType`).
 */
@Injectable()
export class MessageAttachmentResolver {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  /**
   * Le rattachement de chaque message, par id de message. Un message sans rattachement — ou dont
   * la cible est hors de portée, ou supprimée (`SetNull`) — n'a simplement pas d'entrée.
   */
  async resolve(messages: readonly Message[]): Promise<Map<string, MessageAttachmentDto>> {
    const citedSessionIds = unique(messages.map((message) => message.scheduledSessionId));
    const feedbackIds = unique(messages.map((message) => message.sessionFeedbackId));
    if (citedSessionIds.length === 0 && feedbackIds.length === 0) return new Map();

    // Un débrief n'a pas de titre : c'est SA séance qui en porte un. On résout donc les débriefs
    // d'abord, puis les séances des deux origines en une seule requête.
    const feedbacks =
      feedbackIds.length === 0
        ? []
        : await this.db.sessionFeedback.findMany({
            where: { id: { in: feedbackIds } },
            select: { id: true, scheduledSessionId: true },
          });
    const sessionIdByFeedbackId = new Map(
      feedbacks.map((feedback) => [feedback.id, feedback.scheduledSessionId]),
    );

    const sessionIds = unique([...citedSessionIds, ...sessionIdByFeedbackId.values()]);
    const sessions =
      sessionIds.length === 0
        ? []
        : await this.db.scheduledSession.findMany({
            where: { id: { in: sessionIds } },
            select: { id: true, title: true, scheduledDate: true },
          });
    const sessionById = new Map<string, SessionLabel>(
      sessions.map((session) => [session.id, session]),
    );

    const byMessageId = new Map<string, MessageAttachmentDto>();
    for (const message of messages) {
      const attachment = toAttachment(message, sessionIdByFeedbackId, sessionById);
      if (attachment != null) byMessageId.set(message.id, attachment);
    }
    return byMessageId;
  }
}

/**
 * Le débrief l'emporte sur la séance quand les deux sont posés : rien ne l'interdit au schéma, et
 * « à propos de ton débrief » est alors le plus précis des deux — c'est déjà dire de quelle séance
 * on parle.
 */
function toAttachment(
  message: Message,
  sessionIdByFeedbackId: ReadonlyMap<string, string>,
  sessionById: ReadonlyMap<string, SessionLabel>,
): MessageAttachmentDto | null {
  if (message.sessionFeedbackId != null) {
    const scheduledSessionId = sessionIdByFeedbackId.get(message.sessionFeedbackId);
    const session = scheduledSessionId == null ? undefined : sessionById.get(scheduledSessionId);
    // Cible hors de portée : le message reste, il perd son contexte. Pas de libellé de repli —
    // « à propos de quelque chose » ne dit rien de plus qu'une bulle nue (règle dure n°5).
    if (scheduledSessionId == null || session == null) return null;
    return {
      type: MessageAttachmentType.SESSION_FEEDBACK,
      id: message.sessionFeedbackId,
      scheduledSessionId,
      sessionTitle: session.title,
      scheduledDate: toIsoDate(session.scheduledDate),
    };
  }

  if (message.scheduledSessionId != null) {
    const session = sessionById.get(message.scheduledSessionId);
    if (session == null) return null;
    return {
      type: MessageAttachmentType.SCHEDULED_SESSION,
      id: message.scheduledSessionId,
      scheduledSessionId: message.scheduledSessionId,
      sessionTitle: session.title,
      scheduledDate: toIsoDate(session.scheduledDate),
    };
  }

  return null;
}

function unique(ids: readonly (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id != null))];
}
