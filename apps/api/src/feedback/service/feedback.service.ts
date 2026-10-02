import type {
  FeedbackTracking,
  MessageDto,
  SessionFeedbackDto,
  UpsertSessionFeedbackInput,
} from "@cmv/shared";
import { FEEDBACK_EVENT_MESSAGE_TYPES, required, ScheduledSessionStatus } from "@cmv/shared";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma, type SessionFeedback } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import { toMessageDto } from "../../message/message.mapper";
import { FeedbackAnnouncerService } from "../../message/service/feedback-announcer.service";
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
 * Le débrief où l'athlète écrit, et ce que l'écriture en cours en a fait. `created` décide de
 * l'annonce : « nouveau débrief » s'il naît de ce geste, « débrief complété » sinon (#537).
 */
export type WritableFeedback = {
  feedback: SessionFeedback;
  sessionTitle: string;
  created: boolean;
};

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
    // Déposer un débrief laisse un avis dans le fil (#96) : le coach revient par la messagerie.
    private readonly announcer: FeedbackAnnouncerService,
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
    if (input.tracking !== undefined) {
      await this.assertTrackedExercisesKnown(scheduledSessionId, input.tracking);
    }
    const writable = await this.getOrCreateWritable(scheduledSessionId);
    await this.db.sessionFeedback.update({
      where: { id: writable.feedback.id },
      data: { content: input.content ?? null },
    });
    if (input.tracking !== undefined) {
      await this.writeTracking(scheduledSessionId, input.tracking);
    }
    // Enregistrer le texte est toujours un geste à lui seul : jamais la suite d'un lot.
    await this.markSent(writable, false);
    // Écrit juste au-dessus : le relire ne peut pas manquer.
    return required(
      await this.findByScheduledSession(scheduledSessionId),
      `[feedback] débrief de la séance ${scheduledSessionId} absent après écriture`,
    );
  }

  /**
   * Refuse un suivi qui cite un exercice que la séance ne porte pas (#311).
   *
   * L'ignorer, c'était répondre 200 à un débrief dont les coches n'avaient atterri nulle part :
   * le client vidait alors son suivi local, et la perte était définitive. Un refus laisse les
   * coches sur l'appareil — l'athlète n'a rien perdu, et le client sait qu'il doit se reprendre.
   *
   * Contrôlé AVANT toute écriture, texte compris : le débrief n'est pas écrit dans une seule
   * transaction, et un refus après coup laisserait un débrief à moitié enregistré — voire en
   * créerait un, séance passée en DONE, pour une requête refusée. La garde de séance passe en
   * premier : la séance d'un autre reste un 404, pas un 400 qui dirait qu'elle existe.
   */
  private async assertTrackedExercisesKnown(
    scheduledSessionId: string,
    tracking: FeedbackTracking,
  ): Promise<void> {
    const cited = Object.keys(tracking);
    if (cited.length === 0) return;

    await this.athletePlans.getPublishedSessionOrThrow(scheduledSessionId);
    const known = await this.db.scheduledSessionExercise.findMany({
      where: { scheduledSessionId, id: { in: cited } },
      select: { id: true },
    });
    if (known.length === cited.length) return;

    const knownIds = new Set(known.map((exercise) => exercise.id));
    const unknown = cited.filter((id) => !knownIds.has(id));
    throw new BadRequestException(
      `Le suivi cite un exercice absent de cette séance : ${unknown.join(", ")}`,
    );
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
   * N'annonce RIEN : l'appelant écrit d'abord, puis appelle `markSent`. Prévenir avant d'écrire
   * laissait au coach le temps d'ouvrir un débrief dont le texte n'était pas encore là.
   *
   * Création manuelle plutôt que `upsert` Prisma : cette opération est interdite par le client
   * tenant (son `where` unique créerait un angle mort de scope).
   */
  async getOrCreateWritable(scheduledSessionId: string): Promise<WritableFeedback> {
    const session = await this.athletePlans.getPublishedSessionOrThrow(scheduledSessionId);
    const existing = await this.db.sessionFeedback.findFirst({ where: { scheduledSessionId } });
    if (existing != null) {
      return { feedback: existing, sessionTitle: session.title, created: false };
    }

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
    return { feedback, sessionTitle: session.title, created: true };
  }

  /**
   * Un envoi de l'athlète vient d'aboutir — texte enregistré, ou média joint (#537).
   *
   * - Le débrief redevient « à relire » : sinon un ajout tardif resterait invisible dans la tuile
   *   du coach, qui l'a peut-être déjà ouvert. Vaut pour un média comme pour le texte — une photo
   *   ajoutée seule ne remontait pas.
   * - Un avis est posé dans le fil ; c'est l'annonceur qui décide s'il a quelque chose à dire.
   * - Le coach est prévenu : « nouveau débrief » s'il naît de ce geste, « débrief complété » par
   *   push seul sinon. La suite d'un lot de médias se tait — six photos font un push, pas six.
   *   Le dépôt initial ne pousse qu'une fois : l'appel qui crée est aussi le premier du lot.
   */
  async markSent(writable: WritableFeedback, continuesBatch: boolean): Promise<void> {
    const { feedback, created } = writable;
    if (!created) {
      await this.db.sessionFeedback.update({
        where: { id: feedback.id },
        data: { coachReadAt: null },
      });
    }
    await this.announcer.announce(feedback);

    const event = {
      coachId: feedback.coachId,
      athleteId: feedback.athleteId,
      scheduledSessionId: feedback.scheduledSessionId,
      sessionTitle: writable.sessionTitle,
    };
    if (created) {
      await this.notifications.notifyFeedbackReceived(event);
    } else if (!continuesBatch) {
      await this.notifications.notifyFeedbackCompleted(event);
    }
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
      // Les AVIS sont écartés : ils annoncent ce débrief-ci, les afficher dedans reviendrait à
      // dire « débrief déposé » au milieu du débrief qu'on est en train de lire.
      where: { sessionFeedbackId, type: { notIn: [...FEEDBACK_EVENT_MESSAGE_TYPES] } },
      orderBy: { createdAt: "asc" },
    });
    if (messages.length === 0) return [];

    const attachments = await this.attachments.resolve(messages);
    return Promise.all(
      messages.map((message) =>
        // Chaque message est rattaché à CE débrief (filtre ci-dessus) : le résolveur l'a rendu.
        toMessageDto(
          message,
          this.storage,
          required(attachments.get(message.id), `[feedback] message ${message.id} non rattaché`),
        ),
      ),
    );
  }
}
