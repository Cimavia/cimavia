import type { CoachFeedbackSummaryDto } from "@cmv/shared";
import { FEEDBACK_EVENT_MESSAGE_TYPES, required } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ScheduledSession } from "@prisma/client";
import { UserDirectoryService } from "../../account/service/user-directory.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toIsoDate } from "../../util/date.util";

/**
 * Lecture coach des débriefs : ceux de SES cycles, et ceux des cycles qu'on lui ouvre (#610). Le
 * scope tenant s'en porte garant — le débrief se lit à travers sa planification. Écriture réservée
 * à l'athlète : le coach ne fait que lire et marquer comme lu.
 *
 * « Lu » est à chaque Coach (`SessionFeedbackRead`) : C et M suivent le cycle de TI, et la lecture
 * de l'un ne l'éteint pas pour l'autre.
 */
@Injectable()
export class CoachFeedbackService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly users: UserDirectoryService,
    // « Répondu » se lit dans les fils des AUTRES Coachs : voir `firstCoachReplyByFeedback`.
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Tous les débriefs reçus, du plus récemment touché au plus ancien : c'est l'ordre utile au
   * coach, qui traite ce qui vient d'arriver. Pas de pagination (cf. dette P2-2) — un coach a
   * des dizaines d'athlètes, pas des milliers.
   */
  async list(): Promise<CoachFeedbackSummaryDto[]> {
    // Sans filtre de propriétaire : le scope ouvre aussi les débriefs des cycles partagés (#610).
    const feedbacks = await this.db.sessionFeedback.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { media: true } } },
    });
    if (feedbacks.length === 0) return [];
    const feedbackIds = feedbacks.map((feedback) => feedback.id);

    // ⚠️ La séance est chargée par une requête SCOPÉE à part, jamais par un `include` : les
    // include imbriqués échappent au scope tenant (piège n°2 du multi-tenant).
    const [sessions, reads, replies] = await Promise.all([
      this.db.scheduledSession.findMany({
        where: { id: { in: feedbacks.map((feedback) => feedback.scheduledSessionId) } },
      }),
      // Les lectures du Coach courant seul : le scope ne lui rend que les siennes.
      this.db.sessionFeedbackRead.findMany({
        where: { sessionFeedbackId: { in: feedbackIds } },
        select: { sessionFeedbackId: true, readAt: true },
      }),
      this.firstCoachReplyByFeedback(feedbacks),
    ]);
    const sessionById = new Map<string, ScheduledSession>(
      sessions.map((session) => [session.id, session]),
    );
    const readAt = new Map(reads.map((read) => [read.sessionFeedbackId, read.readAt]));

    // Le coach suit N athlètes : sans le nom, la liste serait une suite d'ids opaques. Les auteurs
    // des réponses dans le même appel.
    const names = await this.users.namesByIds([
      ...feedbacks.map((feedback) => feedback.athleteId),
      ...[...replies.values()].map((reply) => reply.senderId),
    ]);

    return feedbacks.map((feedback) => {
      // Les deux sont garantis par des FK : une absence signalerait une incohérence de données,
      // pas un cas métier — on lève plutôt que d'afficher un trou (règle n°5).
      const missing = `[feedback] débrief ${feedback.id} sans séance ou sans athlète résolu`;
      const session = required(sessionById.get(feedback.scheduledSessionId), missing);
      const athleteName = required(names.get(feedback.athleteId), missing);
      const reply = replies.get(feedback.id);
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
        coachReadAt: readAt.get(feedback.id)?.toISOString() ?? null,
        // `null` = personne n'a encore répondu. Pas de date de repli (règle dure n°5).
        firstReply:
          reply == null
            ? null
            : {
                at: reply.createdAt.toISOString(),
                coachId: reply.senderId,
                coachName: required(
                  names.get(reply.senderId),
                  `[feedback] auteur ${reply.senderId} de la réponse au débrief ${feedback.id} non résolu`,
                ),
              },
        createdAt: feedback.createdAt.toISOString(),
        updatedAt: feedback.updatedAt.toISOString(),
      };
    });
  }

  /**
   * « Répondu », DÉRIVÉ : le premier message d'un Coach rattaché à chaque débrief, dans N'IMPORTE
   * QUEL fil (#610) — C doit voir que M a déjà répondu à TI, sans quoi ils répondraient tous deux.
   *
   * Aucune colonne, aucun état à maintenir cohérent — même dispositif que `resolveInvoiceState`
   * (« en retard ») et `isReminderDue` (« dû »). Distinct de la lecture, qui repasse à « à relire »
   * quand l'athlète complète son débrief : « lu » et « répondu » sont deux axes.
   *
   * **Par le client de base**, et c'est la seule lecture de ce service à échapper au scope : le
   * message de M est dans le fil de M, que le scope ferme à C. Elle est sûre à deux conditions,
   * tenues ici :
   * - les débriefs viennent de la liste SCOPÉE — on ne regarde que ceux que l'acteur lit ;
   * - elle ne rend que la date et l'auteur, jamais le contenu, qui reste dans son fil.
   *
   * « D'un Coach » : l'auteur n'est pas l'athlète du débrief. Aujourd'hui, un fil n'a que ses deux
   * parties ; la règle tient encore quand il en aura plusieurs (#611). Les AVIS sont écartés
   * (#316) : ce sont des événements du serveur, signés de l'athlète, pas des réponses.
   *
   * UNE requête pour toute la liste, pas une par ligne. Prisma ne compare pas deux colonnes dans un
   * `where` sans SQL brut : le tri se fait ici, sur un lot déjà borné aux débriefs listés.
   */
  private async firstCoachReplyByFeedback(
    feedbacks: readonly { id: string; athleteId: string }[],
  ): Promise<Map<string, { senderId: string; createdAt: Date }>> {
    const athleteOf = new Map(feedbacks.map((feedback) => [feedback.id, feedback.athleteId]));
    const messages = await this.prisma.message.findMany({
      where: {
        sessionFeedbackId: { in: [...athleteOf.keys()] },
        type: { notIn: [...FEEDBACK_EVENT_MESSAGE_TYPES] },
      },
      orderBy: { createdAt: "asc" },
      select: { sessionFeedbackId: true, senderId: true, createdAt: true },
    });

    const firstReply = new Map<string, { senderId: string; createdAt: Date }>();
    for (const { sessionFeedbackId, senderId, createdAt } of messages) {
      if (sessionFeedbackId == null || senderId === athleteOf.get(sessionFeedbackId)) continue;
      // Les messages arrivent du plus ancien au plus récent : la première entrée est la bonne.
      if (!firstReply.has(sessionFeedbackId)) {
        firstReply.set(sessionFeedbackId, { senderId, createdAt });
      }
    }
    return firstReply;
  }

  /**
   * Marque un débrief comme lu par le Coach courant — chez lui seul (#610). Idempotent : rouvrir
   * un débrief déjà lu ne redate pas la lecture, sinon « à relire » perdrait son sens au premier
   * coup d'œil répété.
   */
  async markRead(id: string): Promise<CoachFeedbackSummaryDto> {
    // Le débrief d'un cycle qu'il ne lit pas est introuvable : 404, pas de lecture posée.
    const feedback = await this.db.sessionFeedback.findFirst({
      where: { id },
      select: { id: true },
    });
    if (feedback == null) {
      throw new NotFoundException("Débrief introuvable");
    }
    // `coachId` injecté par le scope. Le doublon (double clic, deux onglets) est absorbé par
    // `skipDuplicates`, qui garde la première date : l'`upsert` est fermé par le client tenant.
    await this.db.sessionFeedbackRead.createMany({
      data: [{ sessionFeedbackId: id } as Prisma.SessionFeedbackReadCreateManyInput],
      skipDuplicates: true,
    });

    // Lu juste au-dessus sous le même filtre : la liste le contient forcément.
    const summaries = await this.list();
    return required(
      summaries.find((summary) => summary.id === id),
      `[feedback] débrief ${id} absent de la liste après lecture`,
    );
  }
}
