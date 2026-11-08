import { ProblemType } from "@cmv/shared";
import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InvoiceStatus,
  NotificationEntityType,
  type Prisma,
  ReminderEntityType,
} from "@prisma/client";
import { AuthService } from "@thallesp/nestjs-better-auth";
import { ClsService } from "nestjs-cls";
import { InjectPinoLogger, type PinoLogger } from "nestjs-pino";
import { CustomMetricService } from "../../custom-metric/service/custom-metric.service";
import { EXERCISE_DETAIL_INCLUDE } from "../../exercise/exercise.mapper";
import { ExerciseCopyService } from "../../exercise/service/exercise-copy.service";
import { AccountErasedMailer } from "../../infra/mail/account-erased.mailer";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { explainForeignKeyViolation } from "../../infra/prisma/prisma-error";
import { chunked, citedStorageKeys } from "../../infra/storage/object-citations";
import { ObjectPurgeService } from "../../infra/storage/object-purge.service";
import { ProblemException } from "../../problem/problem.exception";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { runAsCoach } from "../../tenancy/tenant-context.type";
import { readErasureFootprint } from "../erasure-footprint";
import { ErasureAttemptsService } from "./erasure-attempts.service";

/**
 * Le plafond par défaut de Prisma (5 s) est taillé pour une écriture : un coach installé depuis des
 * années part avec des milliers de lignes, en une fois.
 */
const ERASURE_TRANSACTION = { timeout: 60_000, maxWait: 10_000 };

/** À la place du nom dans « Cotation (…) » : le libellé est stocké, il survivrait au compte. */
const ERASED_OWNER_LABEL = "copie";

const BUSY_MESSAGE = "Ton compte vient d'être utilisé ailleurs : réessaie dans un instant";

type ErasedUser = { name: string; email: string; locale: string };

/**
 * Efface un compte et tout ce qui s'y rattache (#256). Le seul chemin de suppression d'un `User` :
 * `/delete-user` de Better Auth reste fermé, il retire la session et le mot de passe avant la ligne,
 * sans transaction, et un échec laisserait un compte vivant dont personne ne peut plus se servir.
 *
 * Par le client de BASE : l'effacement traverse les deux capacités du compte et des lignes d'autres
 * Coachs (conversations, factures, documents partagés) que le scope tenant masquerait. Chaque
 * requête part de l'id de l'acteur, jamais d'une entrée client : `eraseWithPassword` le reçoit du
 * contexte, la commande d'exploitation de l'opérateur.
 *
 * `Tout part des deux côtés` : le coach d'un athlète qui s'en va perd aussi les plans, débriefs et
 * messages de cet athlète. Seule exception, ses factures émises restent chez le coach, nom figé.
 */
@Injectable()
export class AccountErasureService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly cls: ClsService,
    private readonly copies: ExerciseCopyService,
    private readonly metrics: CustomMetricService,
    private readonly purge: ObjectPurgeService,
    private readonly mailer: AccountErasedMailer,
    private readonly attempts: ErasureAttemptsService,
    private readonly auth: AuthService,
    @InjectPinoLogger(AccountErasureService.name) private readonly logger: PinoLogger,
  ) {}

  /** Le geste du titulaire : son mot de passe, même avec une session toute fraîche. */
  async eraseWithPassword(userId: string, password: string): Promise<void> {
    this.attempts.consume(userId);
    if (!(await this.passwordMatches(userId, password))) {
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        ProblemType.ERASURE_PASSWORD_REJECTED,
        "Mot de passe incorrect",
      );
    }
    // Avant l'effacement : un « réessaie » (409) avec le bon mot de passe n'est pas un essai perdu.
    this.attempts.clear(userId);
    await this.removeAccount(userId, true);
    // Sans l'attendre : le compte est parti, un stockage lent n'a pas à retenir la réponse.
    void this.purge.drainSafely();
  }

  /**
   * Sans mot de passe : réservé à la commande d'exploitation (demande reçue par e-mail, suppressions
   * rejouées après une restauration). `notify: false` pour ce second cas : la personne a déjà été
   * prévenue, et un second message annoncerait un événement qu'elle n'a pas provoqué.
   */
  async erase(userId: string, { notify = true }: { notify?: boolean } = {}): Promise<void> {
    await this.removeAccount(userId, notify);
    // Attendue ici : la commande ferme ensuite la connexion à la base.
    await this.purge.drainSafely();
  }

  private async removeAccount(userId: string, notify: boolean): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, locale: true },
    });
    if (user == null) throw new NotFoundException("Compte introuvable");

    await this.freezeForeignCitations(userId);
    // Une séance a pu citer un exercice depuis la copie : la clé étrangère refuse et rien n'est
    // parti. Rejouer suffit, la copie étant idempotente.
    await explainForeignKeyViolation(
      () => this.prisma.$transaction((tx) => this.eraseRows(tx, userId, user), ERASURE_TRANSACTION),
      () => Promise.reject(new ConflictException(BUSY_MESSAGE)),
    );

    // Avant tout le reste, et l'id seul : c'est ce journal qui permet de rejouer la suppression
    // après une restauration.
    this.logger.info({ userId }, "account.erased");
    if (notify) await this.mailer.send({ to: user.email, locale: user.locale });
  }

  private async passwordMatches(userId: string, password: string): Promise<boolean> {
    const account = await this.prisma.account.findFirst({
      where: { userId, providerId: "credential" },
      select: { password: true },
    });
    if (account?.password == null) return false;
    const context = await this.auth.instance.$context;
    return context.password.verify({ hash: account.password, password });
  }

  /**
   * Les séances des AUTRES Coachs qui citent un exercice de ce compte en gardent une copie figée
   * (#609), comme si l'exercice avait été supprimé à la main. Hors de la transaction principale :
   * elle s'écrit dans le scope de chaque Coach, et la grande transaction passe par le client de base.
   * Idempotente : une citation repointée n'est plus relue au prochain essai.
   */
  private async freezeForeignCitations(userId: string): Promise<void> {
    const citations = await this.prisma.sessionExercise.findMany({
      where: { exercise: { coachId: userId }, coachId: { not: userId } },
      distinct: ["exerciseId", "coachId"],
      select: { coachId: true, exercise: { include: EXERCISE_DETAIL_INCLUDE } },
    });
    if (citations.length === 0) return;

    // Lu AVANT la transaction (piège n°9) : le catalogue d'un Coach ne se lit pas sous le scope d'un
    // autre.
    const catalog = (await this.metrics.catalogOf([userId]))(userId);
    const at = new Date();
    await runAsCoach(this.cls, userId, () =>
      this.db.$transaction(async (tx) => {
        for (const { exercise, coachId } of citations) {
          // Une métrique homonyme prendrait sinon le nom de qui part, chez un Coach qui reste.
          const coach = { ...exercise.coach, name: ERASED_OWNER_LABEL };
          await this.copies.freezeFor(tx, { ...exercise, coach, catalog }, coachId, at);
        }
      }, ERASURE_TRANSACTION),
    );
  }

  private async eraseRows(
    tx: Prisma.TransactionClient,
    userId: string,
    user: ErasedUser,
  ): Promise<void> {
    const footprint = await readErasureFootprint(tx, userId, user.email);

    // Sans clé étrangère vers leur entité : aucune cascade ne les emporterait.
    for (const entityType of Object.values(NotificationEntityType)) {
      for (const ids of chunked(footprint.notices[entityType])) {
        await tx.notification.deleteMany({ where: { entityType, entityId: { in: ids } } });
      }
    }
    for (const entityType of Object.values(ReminderEntityType)) {
      for (const ids of chunked(footprint.reminders[entityType])) {
        await tx.reminder.deleteMany({ where: { entityType, entityId: { in: ids } } });
      }
    }

    await tx.invoice.updateMany({
      where: { id: { in: footprint.retainedInvoiceIds } },
      // Détachée du cycle : la cascade du plan l'emporterait, or elle appartient au coach.
      data: { planId: null, erasedAthleteName: user.name },
    });
    await tx.invoice.deleteMany({ where: { athleteId: userId, status: InvoiceStatus.DRAFT } });
    await tx.conversation.deleteMany({ where: { id: { in: footprint.directConversationIds } } });
    await tx.invitation.deleteMany({ where: { id: { in: footprint.invitationIds } } });
    // Sans lien vers `User` : un lien de réinitialisation resterait valable pour un compte parti.
    await tx.verification.deleteMany({ where: { value: userId } });
    // AVANT le compte : `SessionExercise.exerciseId` est en `Restrict`, et ses propres séances
    // citent ses propres exercices.
    await tx.session.deleteMany({ where: { coachId: userId } });
    const { count } = await tx.user.deleteMany({ where: { id: userId } });
    // Un double envoi : l'autre requête vient de tout effacer, celle-ci n'a plus rien à faire.
    if (count === 0) throw new NotFoundException("Compte introuvable");
    await this.resetGroupActivity(tx, footprint.groupConversationIds);

    // Comptées APRÈS les suppressions : seules restent les citations des autres comptes.
    const cited = await citedStorageKeys(tx, footprint.objectKeys);
    const orphaned = footprint.objectKeys.filter((key) => !cited.has(key));
    for (const keys of chunked(orphaned)) {
      await tx.pendingObjectDeletion.createMany({
        data: keys.map((key) => ({ key })),
        skipDuplicates: true,
      });
    }
  }

  /** Ses messages sont partis : un groupe ne doit pas rester daté d'une activité disparue. */
  private async resetGroupActivity(
    tx: Prisma.TransactionClient,
    conversationIds: readonly string[],
  ): Promise<void> {
    for (const id of conversationIds) {
      const last = await tx.message.findFirst({
        where: { conversationId: id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      await tx.conversation.update({
        where: { id },
        data: { lastMessageAt: last?.createdAt ?? null },
      });
    }
  }
}
