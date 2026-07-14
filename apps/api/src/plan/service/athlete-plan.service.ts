import type { PlanDto, ScheduledSessionDto } from "@cmv/shared";
import { PlanStatus, selectCurrentPlan } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { todayIsoDate, toIsoDate } from "../../util/date.util";
import { PLAN_COUNTS_INCLUDE, PLAN_DETAIL_INCLUDE, toPlanDto } from "../plan.mapper";
import { SESSION_DETAIL_INCLUDE, toScheduledSessionDto } from "../scheduled-session.mapper";

/**
 * Lecture athlète des planifications.
 *
 * ⚠️ Le tenancy layer scope l'athlète par `athleteId` — il ne dit RIEN du statut : sans le filtre
 * `PUBLISHED` posé ici, l'athlète verrait les brouillons que son coach est en train d'écrire.
 * D'où un service dédié : tout accès athlète passe par `publishedOnly`, aucune requête ne s'en
 * échappe (les brouillons ne sont donc jamais lisibles, même par l'id exact d'une séance).
 */
@Injectable()
export class AthletePlanService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
  ) {}

  /**
   * Le cycle courant de l'athlète, avec ses semaines et ses séances — la vue planning tient dans
   * cette seule requête (utile pour le cache hors-ligne). `null` s'il n'a aucun plan diffusé :
   * pas de plan vide de complaisance (règle dure n°5).
   */
  async myCurrentPlan(): Promise<PlanDto | null> {
    const plans = await this.db.plan.findMany({
      where: { status: PlanStatus.PUBLISHED },
      include: PLAN_COUNTS_INCLUDE,
    });

    // Le choix « en cours > à venir > terminé » est une fonction pure partagée (@cmv/shared) :
    // l'API et les clients ne peuvent pas diverger là-dessus.
    const current = selectCurrentPlan(
      plans.map((plan) => ({
        id: plan.id,
        startDate: toIsoDate(plan.startDate),
        weekCount: plan._count.weeks,
      })),
      todayIsoDate(),
    );
    if (current == null) return null;

    const detail = await this.db.plan.findFirst({
      where: { id: current.id, status: PlanStatus.PUBLISHED },
      include: PLAN_DETAIL_INCLUDE,
    });
    if (detail == null) return null;
    return toPlanDto(detail);
  }

  // Détail d'une séance : exercices, consignes et documents (URLs GET signées).
  async getScheduledSession(id: string): Promise<ScheduledSessionDto> {
    const session = await this.db.scheduledSession.findFirst({
      // Filtre relationnel (pas un `include`) : il s'ajoute au scope athlète du tenancy layer,
      // donc une séance d'un cycle encore en brouillon reste invisible.
      where: { id, plan: { status: PlanStatus.PUBLISHED } },
      include: SESSION_DETAIL_INCLUDE,
    });
    if (session == null) {
      throw new NotFoundException("Séance introuvable");
    }
    return toScheduledSessionDto(session, this.storage);
  }
}
