import type {
  FeedbackBlockTracking,
  FeedbackTracking,
  MessageDto,
  SessionFeedbackDto,
  UpsertSessionFeedbackInput,
} from "@cmv/shared";
import {
  blockChecks,
  FEEDBACK_EVENT_MESSAGE_TYPES,
  required,
  ScheduledSessionStatus,
  trackingFitsBlock,
} from "@cmv/shared";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma, type SessionFeedback } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import { toMessageDto } from "../../message/message.mapper";
import { FeedbackAnnouncerService } from "../../message/service/feedback-announcer.service";
import { MessageAttachmentResolver } from "../../message/service/message-attachment.resolver";
import { NotificationService } from "../../notification/notification.service";
import { AthletePlanService, type PublishedSession } from "../../plan/service/athlete-plan.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { parseSettings, toJsonInput } from "../../util/block-json.util";
import {
  BLOCK_EXERCISE_KEYS,
  blockExerciseKeys,
  FEEDBACK_DETAIL_INCLUDE,
  toSessionFeedbackDto,
  toTrackedBlocks,
  toTrackedExercises,
} from "../feedback.mapper";
import { FeedbackAudienceService } from "./feedback-audience.service";

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
    // Qui prévenir : chaque Coach qui lit le débrief (#610).
    private readonly audience: FeedbackAudienceService,
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
    const tracking = input.tracking ?? {};
    const blockTracking = input.blockTracking ?? {};
    // La garde de séance passe en premier, et une seule fois : la séance d'un autre reste un 404,
    // pas un 400 de suivi qui dirait qu'elle existe.
    const session = await this.athletePlans.getPublishedSessionOrThrow(scheduledSessionId);
    await this.assertTrackedExercisesKnown(scheduledSessionId, tracking);
    await this.assertTrackedBlocksFit(scheduledSessionId, blockTracking);
    const writable = await this.writableOf(session);
    await this.db.sessionFeedback.update({
      where: { id: writable.feedback.id },
      data: { content: input.content ?? null },
    });
    await this.writeTracking(scheduledSessionId, tracking, blockTracking);
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
   * créerait un, séance passée en DONE, pour une requête refusée. L'appelant a déjà passé la garde
   * de séance.
   */
  private async assertTrackedExercisesKnown(
    scheduledSessionId: string,
    tracking: FeedbackTracking,
  ): Promise<void> {
    const cited = Object.keys(tracking);
    if (cited.length === 0) return;

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
   * Refuse un suivi par bloc (#716) qui cite un bloc que la séance ne porte pas, ou une case que
   * ses réglages ne donnent pas — même raison que `assertTrackedExercisesKnown` : un refus laisse
   * les coches sur l'appareil, un 200 les perdrait. Les cases se lisent avec les exercices du bloc
   * tel qu'il est : une coche sur un exercice retiré depuis n'a plus de case.
   */
  private async assertTrackedBlocksFit(
    scheduledSessionId: string,
    tracking: FeedbackBlockTracking,
  ): Promise<void> {
    const cited = Object.keys(tracking);
    if (cited.length === 0) return;

    const known = await this.db.scheduledSessionBlock.findMany({
      where: { scheduledSessionId, id: { in: cited } },
      select: { id: true, settings: true, exercises: BLOCK_EXERCISE_KEYS },
    });
    const byId = new Map(known.map((block) => [block.id, block]));
    const unknown = cited.filter((id) => !byId.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Le suivi cite un bloc absent de cette séance : ${unknown.join(", ")}`,
      );
    }
    const misfit = known.filter((block) => {
      const state = tracking[block.id];
      if (state == null) return false;
      const checks = blockChecks(parseSettings(block.settings), blockExerciseKeys(block.exercises));
      return !trackingFitsBlock(checks, state);
    });
    if (misfit.length > 0) {
      throw new BadRequestException(
        `Le suivi coche une case que le bloc n'a pas : ${misfit.map((block) => block.id).join(", ")}`,
      );
    }
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
   *
   * Une seule transaction (#297) : le suivi d'une séance arrive d'un bloc, et s'écrit d'un bloc —
   * jamais la moitié des exercices. Le nombre de clés est borné par le schéma, et chacune a déjà
   * été reconnue par `assertTrackedExercisesKnown`, en une seule lecture.
   */
  private async writeTracking(
    scheduledSessionId: string,
    tracking: FeedbackTracking,
    blockTracking: FeedbackBlockTracking,
  ): Promise<void> {
    if (Object.keys(tracking).length === 0 && Object.keys(blockTracking).length === 0) return;
    await this.db.$transaction(async (tx: TenantTx) => {
      for (const [exerciseId, state] of Object.entries(tracking)) {
        await tx.scheduledSessionExercise.updateMany({
          where: { id: exerciseId, scheduledSessionId },
          data: { tracking: state == null ? Prisma.DbNull : (state as Prisma.InputJsonValue) },
        });
      }
      // Les blocs de même (#716), dans la même transaction : la séance s'écrit d'un bloc.
      for (const [blockId, state] of Object.entries(blockTracking)) {
        await tx.scheduledSessionBlock.updateMany({
          where: { id: blockId, scheduledSessionId },
          data: { tracking: state == null ? Prisma.DbNull : toJsonInput(state) },
        });
      }
    });
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
    return this.writableOf(await this.athletePlans.getPublishedSessionOrThrow(scheduledSessionId));
  }

  /** `getOrCreateWritable` pour une séance dont la garde est déjà passée. */
  private async writableOf(session: PublishedSession): Promise<WritableFeedback> {
    const scheduledSessionId = session.id;
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
      await markDoneKeepingVersion(tx, scheduledSessionId);
      return created;
    });
    return { feedback, sessionTitle: session.title, created: true };
  }

  /**
   * Un envoi de l'athlète vient d'aboutir — texte enregistré, ou média joint (#537).
   *
   * - Le débrief redevient « à relire » chez TOUS ses lecteurs : sinon un ajout tardif resterait
   *   invisible dans la tuile d'un coach qui l'a déjà ouvert. Vaut pour un média comme pour le
   *   texte — une photo ajoutée seule ne remontait pas.
   * - Chaque Coach qui lit le débrief est prévenu (#610), pas seulement le propriétaire du cycle :
   *   un avis dans son fil, et une notification — « nouveau débrief » s'il naît de ce geste,
   *   « débrief complété » par push seul sinon. La suite d'un lot de médias se tait : six photos
   *   font un push, pas six. Le dépôt initial ne pousse qu'une fois : l'appel qui crée est aussi le
   *   premier du lot.
   */
  async markSent(writable: WritableFeedback, continuesBatch: boolean): Promise<void> {
    const { feedback, created } = writable;
    if (!created) {
      await this.db.sessionFeedbackRead.deleteMany({ where: { sessionFeedbackId: feedback.id } });
    }
    const recipients = await this.audience.recipientsOf(feedback);
    await this.announcer.announce(feedback, recipients);

    if (!created && continuesBatch) return;
    await Promise.all(
      recipients.map((coachId) => {
        const event = {
          coachId,
          athleteId: feedback.athleteId,
          scheduledSessionId: feedback.scheduledSessionId,
          sessionTitle: writable.sessionTitle,
        };
        return created
          ? this.notifications.notifyFeedbackReceived(event)
          : this.notifications.notifyFeedbackCompleted(event);
      }),
    );
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
    // charger la séance de son athlète juste pour savoir ce qui a été coché. Un exercice de bloc
    // se compte avec son bloc (#722) : le compter aussi seul dirait deux fois le même suivi.
    const [exercises, blocks, messages] = await Promise.all([
      this.db.scheduledSessionExercise.findMany({
        where: { scheduledSessionId, blockId: null },
        orderBy: { position: "asc" },
        select: { id: true, title: true, blocks: true, tracking: true },
      }),
      this.db.scheduledSessionBlock.findMany({
        where: { scheduledSessionId },
        orderBy: { position: "asc" },
        select: {
          id: true,
          label: true,
          name: true,
          settings: true,
          tracking: true,
          exercises: BLOCK_EXERCISE_KEYS,
        },
      }),
      this.attachedMessages(feedback.id),
    ]);
    return toSessionFeedbackDto(
      feedback,
      this.storage,
      { trackedExercises: toTrackedExercises(exercises), trackedBlocks: toTrackedBlocks(blocks) },
      messages,
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

/** Au-delà, la version cède : le coach prendra un conflit de trop, l'athlète jamais un échec. */
const MARK_DONE_ATTEMPTS = 3;

/**
 * Passe la séance en DONE sans faire avancer sa version (#604). `updatedAt` y veut dire « dernière
 * écriture du coach » : c'est la version que cite son panneau d'édition, et un débrief ne change
 * rien de ce que le coach a composé. Sans cette exception, l'athlète qui débriefe ferait refuser
 * l'enregistrement du coach par un « modifiée pendant que tu l'éditais » qui ne dit pas vrai.
 *
 * La version relue est réécrite telle quelle, SOUS CONDITION qu'elle n'ait pas bougé : une
 * écriture du coach glissée entre la lecture et l'écriture ferait sinon RECULER la version, et un
 * onglet resté sur l'ancienne repasserait la garde. Elle a bougé → on relit et on recommence.
 */
async function markDoneKeepingVersion(tx: TenantTx, id: string): Promise<void> {
  for (let attempt = 0; attempt < MARK_DONE_ATTEMPTS; attempt++) {
    const { updatedAt } = required(
      await tx.scheduledSession.findFirst({ where: { id }, select: { updatedAt: true } }),
      `[feedback] séance ${id} disparue pendant son débrief`,
    );
    const { count } = await tx.scheduledSession.updateMany({
      where: { id, updatedAt },
      data: { status: ScheduledSessionStatus.DONE, updatedAt },
    });
    if (count > 0) return;
  }
  await tx.scheduledSession.update({
    where: { id },
    data: { status: ScheduledSessionStatus.DONE },
  });
}
