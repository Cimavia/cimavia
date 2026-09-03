import type {
  FeedbackTracking,
  MessageDto,
  SessionFeedbackDto,
  UpsertSessionFeedbackInput,
} from "@cmv/shared";
import { ScheduledSessionStatus } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type SessionFeedback } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import { toMessageDto } from "../../message/message.mapper";
import { MessageAttachmentResolver } from "../../message/service/message-attachment.resolver";
import { NotificationService } from "../../notification/notification.service";
import { AthletePlanService } from "../../plan/service/athlete-plan.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import {
  FEEDBACK_DETAIL_INCLUDE,
  toSessionFeedbackDto,
  toTrackedExercises,
} from "../feedback.mapper";

/**
 * Débrief de séance (CDC §5.6) : écrit par l'athlète, lu par le coach.
 *
 * Le tenancy layer garantit qu'un acteur ne voit que SES débriefs, mais il ne dit rien du
 * statut du cycle : la garde « séance de l'athlète courant, dans un plan PUBLISHED » vit dans
 * AthletePlanService, seul point d'entrée de la lecture athlète (P3) — on ne la réécrit pas ici.
 */
@Injectable()
export class FeedbackService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
    private readonly athletePlans: AthletePlanService,
    private readonly notifications: NotificationService,
    // Les réponses rattachées au débrief sont des messages : même mapper, même résolveur de
    // rattachement que la messagerie — sans quoi on aurait deux façons de rendre un message.
    private readonly attachments: MessageAttachmentResolver,
  ) {}

  /**
   * Écrit (ou réécrit) le texte du débrief.
   *
   * Idempotent : l'athlète débriefe en plusieurs fois — poser un texte, ajouter des médias plus
   * tard, corriger son retour. Un débrief vide est un état légitime (« séance faite, rien à
   * signaler ») : aucune contrainte « texte ou média » ne s'y oppose.
   */
  async upsert(
    scheduledSessionId: string,
    input: UpsertSessionFeedbackInput,
  ): Promise<SessionFeedbackDto> {
    const feedback = await this.getOrCreateWritable(scheduledSessionId);
    // Un débrief complété redevient « à relire » : sinon un ajout tardif de l'athlète resterait
    // invisible dans la tuile du coach, qui l'a peut-être déjà ouvert.
    await this.db.sessionFeedback.update({
      where: { id: feedback.id },
      data: { content: input.content ?? null, coachReadAt: null },
    });
    if (input.tracking !== undefined) {
      await this.writeTracking(scheduledSessionId, input.tracking);
    }
    return this.getOrThrow(scheduledSessionId);
  }

  /**
   * Écrit le suivi d'exécution remonté avec le débrief.
   *
   * Chaque exercice est mis à jour SÉPARÉMENT et par son `where` scopé : un `updateMany` sur des
   * identifiants fournis par le client écrirait chez qui les enverrait. Le scope tenant filtre
   * déjà par athlète, mais on ne s'appuie pas sur lui seul pour une écriture pilotée par l'entrée.
   *
   * `null` remet l'exercice en NON SUIVI — c'est une intention, pas une absence : l'athlète peut
   * revenir sur un décompte qu'il a posé par erreur.
   */
  private async writeTracking(
    scheduledSessionId: string,
    tracking: FeedbackTracking,
  ): Promise<void> {
    for (const [exerciseId, state] of Object.entries(tracking)) {
      await this.db.scheduledSessionExercise.updateMany({
        where: { id: exerciseId, scheduledSessionId },
        data: { tracking: state == null ? Prisma.DbNull : (state as Prisma.InputJsonValue) },
      });
    }
  }

  /**
   * Le débrief d'une séance que l'athlète courant a le droit d'écrire, créé s'il n'existe pas.
   *
   * Point d'entrée unique de l'écriture — texte (upsert) comme médias : rattacher une photo à une
   * séance jamais débriefée doit bien créer le débrief qui la porte. Débriefer, sous quelque
   * forme que ce soit, passe la séance en DONE — transition sans retour (un débrief complété ne
   * « redevient » pas planifié).
   *
   * Création manuelle plutôt que `upsert` Prisma : cette opération est interdite par le client
   * tenant (son `where` unique créerait un angle mort de scope).
   */
  async getOrCreateWritable(scheduledSessionId: string): Promise<SessionFeedback> {
    const session = await this.athletePlans.getPublishedSessionOrThrow(scheduledSessionId);
    const existing = await this.db.sessionFeedback.findFirst({ where: { scheduledSessionId } });
    if (existing != null) return existing;

    const feedback = await this.db.$transaction(async (tx) => {
      // athleteId injecté par le tenancy layer ; coachId dénormalisé depuis la séance (jamais
      // depuis le client) — d'où le cast final.
      const data: Omit<Prisma.SessionFeedbackUncheckedCreateInput, "athleteId"> = {
        coachId: session.coachId,
        scheduledSessionId,
        content: null,
      };
      const created = await tx.sessionFeedback.create({
        data: data as Prisma.SessionFeedbackUncheckedCreateInput,
      });
      await tx.scheduledSession.update({
        where: { id: scheduledSessionId },
        data: { status: ScheduledSessionStatus.DONE },
      });
      return created;
    });

    // Notifié à la CRÉATION seulement : l'athlète débriefe en plusieurs fois (texte puis
    // photos), et un push par ajout serait du harcèlement. Les compléments repassent
    // `coachReadAt` à null — visibles dans la tuile « à relire », sans notification.
    await this.notifications.notifyFeedbackReceived({
      coachId: feedback.coachId,
      athleteId: feedback.athleteId,
      scheduledSessionId,
      sessionTitle: session.title,
    });

    return feedback;
  }

  // Lecture du débrief d'une séance. `null` plutôt qu'un débrief vide de complaisance : le rendu
  // gère l'absence (règle dure n°5).
  async findByScheduledSession(scheduledSessionId: string): Promise<SessionFeedbackDto | null> {
    const feedback = await this.db.sessionFeedback.findFirst({
      where: { scheduledSessionId },
      include: FEEDBACK_DETAIL_INCLUDE,
    });
    if (feedback == null) return null;

    // Le décompte ACCOMPAGNE le débrief : il part dans la même réponse, sinon le coach devrait
    // charger la séance de son athlète juste pour savoir ce qui a été coché.
    const exercises = await this.db.scheduledSessionExercise.findMany({
      where: { scheduledSessionId },
      orderBy: { position: "asc" },
      select: { id: true, title: true, blocks: true, tracking: true },
    });
    return toSessionFeedbackDto(
      feedback,
      this.storage,
      toTrackedExercises(exercises),
      await this.attachedMessages(feedback.id),
    );
  }

  /**
   * Les messages rattachés à ce débrief, du plus ancien au plus récent.
   *
   * Une requête SCOPÉE à part, jamais un `include` sur le débrief : un include imbriqué échappe au
   * scope tenant, et ferait remonter la conversation d'une autre relation sans rien signaler.
   *
   * Un seul chemin sert les DEUX capacités — le coach lit le débrief de son athlète par
   * `/scheduled-sessions/:id/feedback`, l'athlète le sien par `/me/...`, et les deux passent ici.
   * Pas de pagination : les réponses à un débrief se comptent en unités (cf. #77).
   */
  private async attachedMessages(sessionFeedbackId: string): Promise<MessageDto[]> {
    const messages = await this.db.message.findMany({
      where: { sessionFeedbackId },
      orderBy: { createdAt: "asc" },
    });
    if (messages.length === 0) return [];

    const attachments = await this.attachments.resolve(messages);
    return Promise.all(
      messages.map((message) =>
        toMessageDto(message, this.storage, attachments.get(message.id) ?? null),
      ),
    );
  }

  private async getOrThrow(scheduledSessionId: string): Promise<SessionFeedbackDto> {
    const feedback = await this.findByScheduledSession(scheduledSessionId);
    if (feedback == null) {
      throw new NotFoundException("Débrief introuvable");
    }
    return feedback;
  }
}
