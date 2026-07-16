import type { SessionFeedbackDto, UpsertSessionFeedbackInput } from "@cmv/shared";
import { ScheduledSessionStatus } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import { AthletePlanService } from "../../plan/service/athlete-plan.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import {
  FEEDBACK_DETAIL_INCLUDE,
  type SessionFeedbackWithMedia,
  toSessionFeedbackDto,
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
  ) {}

  /**
   * Écrit (ou réécrit) le débrief d'une séance et la passe en DONE.
   *
   * Idempotent : l'athlète peut débriefer en plusieurs fois — poser un texte, ajouter des médias
   * plus tard, corriger son retour. D'où le upsert manuel : l'opération `upsert` de Prisma est
   * interdite par le client tenant (son `where` unique créerait un angle mort de scope).
   *
   * DONE est sans retour : un débrief complété ne « redevient » pas planifié. Un débrief vide est
   * un état légitime (« séance faite, rien à signaler ») — d'où l'absence de contrainte « texte
   * ou média » (elle interdirait aussi le débrief média-seul, qui commence par un débrief vide).
   */
  async upsert(
    scheduledSessionId: string,
    input: UpsertSessionFeedbackInput,
  ): Promise<SessionFeedbackDto> {
    const session = await this.athletePlans.getPublishedSessionOrThrow(scheduledSessionId);
    const existing = await this.db.sessionFeedback.findFirst({ where: { scheduledSessionId } });
    const content = input.content ?? null;

    await this.db.$transaction(async (tx) => {
      if (existing == null) {
        // athleteId injecté par le tenancy layer ; coachId dénormalisé depuis la séance (jamais
        // depuis le client) — d'où le cast final.
        const data: Omit<Prisma.SessionFeedbackUncheckedCreateInput, "athleteId"> = {
          coachId: session.coachId,
          scheduledSessionId,
          content,
        };
        await tx.sessionFeedback.create({
          data: data as Prisma.SessionFeedbackUncheckedCreateInput,
        });
      } else {
        // Un débrief complété redevient « à relire » : sinon un ajout tardif de l'athlète
        // resterait invisible dans la tuile du coach, qui l'a peut-être déjà ouvert.
        await tx.sessionFeedback.update({
          where: { id: existing.id },
          data: { content, coachReadAt: null },
        });
      }

      await tx.scheduledSession.update({
        where: { id: scheduledSessionId },
        data: { status: ScheduledSessionStatus.DONE },
      });
    });

    return this.getOrThrow(scheduledSessionId);
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

  /**
   * Le débrief d'une séance tel que l'athlète courant a le droit de l'ÉCRIRE : la garde de
   * statut passe par la séance (un cycle en brouillon n'est pas débriefable). Utilisé par le
   * rattachement de médias (P4) — le scope tenant seul ne suffirait pas.
   */
  async getOwnedWritableOrThrow(scheduledSessionId: string): Promise<SessionFeedbackWithMedia> {
    await this.athletePlans.getPublishedSessionOrThrow(scheduledSessionId);
    const feedback = await this.db.sessionFeedback.findFirst({
      where: { scheduledSessionId },
      include: FEEDBACK_DETAIL_INCLUDE,
    });
    if (feedback == null) {
      throw new NotFoundException("Débrief introuvable");
    }
    return feedback;
  }
}
