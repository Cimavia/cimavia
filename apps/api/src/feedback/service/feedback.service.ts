import type { SessionFeedbackDto, UpsertSessionFeedbackInput } from "@cmv/shared";
import { ScheduledSessionStatus } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, SessionFeedback } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import { AthletePlanService } from "../../plan/service/athlete-plan.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { FEEDBACK_DETAIL_INCLUDE, toSessionFeedbackDto } from "../feedback.mapper";

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
    return this.getOrThrow(scheduledSessionId);
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

    return this.db.$transaction(async (tx) => {
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
  }

  // Lecture du débrief d'une séance. `null` plutôt qu'un débrief vide de complaisance : le rendu
  // gère l'absence (règle dure n°5).
  async findByScheduledSession(scheduledSessionId: string): Promise<SessionFeedbackDto | null> {
    const feedback = await this.db.sessionFeedback.findFirst({
      where: { scheduledSessionId },
      include: FEEDBACK_DETAIL_INCLUDE,
    });
    if (feedback == null) return null;
    return toSessionFeedbackDto(feedback, this.storage);
  }

  private async getOrThrow(scheduledSessionId: string): Promise<SessionFeedbackDto> {
    const feedback = await this.findByScheduledSession(scheduledSessionId);
    if (feedback == null) {
      throw new NotFoundException("Débrief introuvable");
    }
    return feedback;
  }
}
