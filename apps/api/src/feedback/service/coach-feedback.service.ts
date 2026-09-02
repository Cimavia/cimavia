import type { CoachFeedbackSummaryDto } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ScheduledSession } from "@prisma/client";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toIsoDate } from "../../util/date.util";

/**
 * Lecture coach des débriefs de SES athlètes (le scope tenant s'en porte garant : `coachId` est
 * dénormalisé sur le débrief). Écriture réservée à l'athlète — le coach ne fait que lire et
 * marquer comme lu.
 */
@Injectable()
export class CoachFeedbackService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly users: UserDirectoryService,
  ) {}

  /**
   * Tous les débriefs reçus, du plus récemment touché au plus ancien : c'est l'ordre utile au
   * coach, qui traite ce qui vient d'arriver. Pas de pagination (cf. dette P2-2) — un coach a
   * des dizaines d'athlètes, pas des milliers.
   */
  async list(): Promise<CoachFeedbackSummaryDto[]> {
    const feedbacks = await this.db.sessionFeedback.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { media: true } } },
    });
    if (feedbacks.length === 0) return [];

    // ⚠️ La séance est chargée par une requête SCOPÉE à part, jamais par un `include` : les
    // include imbriqués échappent au scope tenant (piège n°2 du multi-tenant).
    const sessions = await this.db.scheduledSession.findMany({
      where: { id: { in: feedbacks.map((feedback) => feedback.scheduledSessionId) } },
    });
    const sessionById = new Map<string, ScheduledSession>(
      sessions.map((session) => [session.id, session]),
    );

    // Le coach suit N athlètes : sans le nom, la liste serait une suite d'ids opaques.
    const names = await this.users.namesByIds(feedbacks.map((feedback) => feedback.athleteId));

    const repliedAt = await this.firstCoachReplyByFeedback(
      feedbacks.map((feedback) => feedback.id),
    );

    return feedbacks.map((feedback) => {
      const session = sessionById.get(feedback.scheduledSessionId);
      const athleteName = names.get(feedback.athleteId);
      if (session == null || athleteName == null) {
        // Les deux sont garantis par des FK : une absence signalerait une incohérence de
        // données, pas un cas métier — on lève plutôt que d'afficher un trou (règle n°5).
        throw new Error(`[feedback] débrief ${feedback.id} sans séance ou sans athlète résolu`);
      }
      return {
        id: feedback.id,
        scheduledSessionId: feedback.scheduledSessionId,
        planId: session.planId,
        athleteId: feedback.athleteId,
        athleteName,
        sessionTitle: session.title,
        scheduledDate: toIsoDate(session.scheduledDate),
        content: feedback.content,
        mediaCount: feedback._count.media,
        coachReadAt: feedback.coachReadAt?.toISOString() ?? null,
        // `null` = pas encore répondu. Pas de date de repli (règle dure n°5) : « — » se rend.
        repliedAt: repliedAt.get(feedback.id)?.toISOString() ?? null,
        createdAt: feedback.createdAt.toISOString(),
        updatedAt: feedback.updatedAt.toISOString(),
      };
    });
  }

  /**
   * « Répondu », DÉRIVÉ : la date du premier message du coach rattaché à chaque débrief.
   *
   * Aucune colonne, aucun état à maintenir cohérent — même dispositif que `resolveInvoiceState`
   * (« en retard ») et `isReminderDue` (« dû »). Distinct de `coachReadAt`, qui repasse à `null`
   * quand l'athlète complète son débrief : « lu » et « répondu » sont deux axes.
   *
   * « Du coach » se lit sur le message lui-même : `senderId === coachId`, les deux étant portés par
   * la ligne (`coachId` est dénormalisé). Aucun acteur à injecter, et un athlète qui répond sur son
   * propre débrief ne le marque donc pas « répondu ». Prisma ne sait pas comparer deux colonnes
   * dans un `where` sans SQL brut : le tri se fait ici, sur un lot déjà borné aux débriefs listés.
   *
   * UNE requête pour toute la liste, pas une par ligne.
   */
  private async firstCoachReplyByFeedback(
    feedbackIds: readonly string[],
  ): Promise<Map<string, Date>> {
    const messages = await this.db.message.findMany({
      where: { sessionFeedbackId: { in: [...feedbackIds] } },
      orderBy: { createdAt: "asc" },
      select: { sessionFeedbackId: true, senderId: true, coachId: true, createdAt: true },
    });

    const firstReply = new Map<string, Date>();
    for (const message of messages) {
      if (message.sessionFeedbackId == null || message.senderId !== message.coachId) continue;
      // Les messages arrivent du plus ancien au plus récent : la première entrée est la bonne.
      if (!firstReply.has(message.sessionFeedbackId)) {
        firstReply.set(message.sessionFeedbackId, message.createdAt);
      }
    }
    return firstReply;
  }

  /**
   * Marque un débrief comme lu. Idempotent : rouvrir un débrief déjà lu ne redate pas la
   * lecture — sinon « à relire » perdrait son sens au premier coup d'œil répété.
   */
  async markRead(id: string): Promise<CoachFeedbackSummaryDto> {
    const feedback = await this.db.sessionFeedback.findFirst({ where: { id } });
    if (feedback == null) {
      throw new NotFoundException("Débrief introuvable");
    }
    if (feedback.coachReadAt == null) {
      await this.db.sessionFeedback.update({ where: { id }, data: { coachReadAt: new Date() } });
    }

    const summaries = await this.list();
    const updated = summaries.find((summary) => summary.id === id);
    if (updated == null) {
      throw new NotFoundException("Débrief introuvable");
    }
    return updated;
  }
}
