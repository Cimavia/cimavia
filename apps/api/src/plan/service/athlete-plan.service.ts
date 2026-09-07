import type { PlanDto, ScheduledSessionDto } from "@cmv/shared";
import { PlanStatus, selectVisiblePlans, todayIsoDate } from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ScheduledSession } from "@prisma/client";
import { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toIsoDate } from "../../util/date.util";
import { PLAN_COUNTS_INCLUDE, PLAN_DETAIL_INCLUDE, toPlanDto } from "../plan.mapper";
import { athleteRecipientOrThrow } from "../plan.recipient";
import { SESSION_DETAIL_INCLUDE, toScheduledSessionDto } from "../scheduled-session.mapper";

/**
 * Lecture athlète des planifications.
 *
 * ⚠️ Le tenancy layer scope l'athlète par `athleteId` — il ne dit RIEN du statut : sans le filtre
 * `PUBLISHED` posé ici, l'athlète verrait les brouillons que son coach est en train d'écrire.
 * D'où un service dédié : tout accès athlète passe par `publishedOnly`, aucune requête ne s'en
 * échappe (les brouillons ne sont donc jamais lisibles, même par l'id exact d'une séance).
 */
/**
 * Une séance d'un cycle DIFFUSÉ : son destinataire est connu, et le type le dit. Depuis #144
 * `ScheduledSession.athleteId` est nullable (les brouillons non affectés), mais aucune séance
 * servie par ce service ne peut l'être — le filtre `PUBLISHED` et le verrou de `publish` s'en
 * portent garants.
 */
export type PublishedSession = ScheduledSession & { athleteId: string };

@Injectable()
export class AthletePlanService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly storage: StorageService,
  ) {}

  /**
   * TOUS les cycles diffusés que l'athlète voit, avec leurs semaines et leurs séances — la vue
   * planning tient dans cette seule requête (utile pour le cache hors-ligne).
   *
   * Liste VIDE s'il n'a aucun cycle diffusé, jamais `null` : la question a reçu une réponse, et
   * les clients réservent leur `null` à la requête qui n'a pas abouti. Confondre les deux ferait
   * attendre son coach à un athlète qui n'a qu'une panne réseau.
   *
   * Le choix des cycles est une fonction pure partagée (`selectVisiblePlans`, @cmv/shared) :
   * l'API et les clients ne peuvent pas diverger là-dessus.
   */
  async myVisiblePlans(): Promise<PlanDto[]> {
    const plans = await this.db.plan.findMany({
      where: { status: PlanStatus.PUBLISHED },
      include: PLAN_COUNTS_INCLUDE,
    });

    const visible = selectVisiblePlans(
      plans.map((plan) => ({
        id: plan.id,
        startDate: toIsoDate(plan.startDate),
        weekCount: plan._count.weeks,
      })),
      todayIsoDate(),
    );
    if (visible.length === 0) return [];

    /**
     * UNE seule requête de détail pour N cycles, et non une par cycle : `findMany` avec un `in`
     * plutôt qu'une boucle de `findFirst`. Le filtre `PUBLISHED` est répété ici bien que
     * `visible` n'en contienne pas d'autre — c'est la garde du service, et elle ne se relâche pas
     * parce qu'un appelant interne a déjà filtré.
     */
    const details = await this.db.plan.findMany({
      where: { id: { in: visible.map((plan) => plan.id) }, status: PlanStatus.PUBLISHED },
      include: PLAN_DETAIL_INCLUDE,
    });

    /**
     * L'ordre est une DONNÉE (en cours d'abord, puis à venir) : Prisma ne le rend pas, on le
     * réapplique depuis `visible`. Les clients affichent les cycles dans l'ordre reçu.
     */
    const byId = new Map(details.map((detail) => [detail.id, detail]));
    return visible.flatMap((plan) => {
      const detail = byId.get(plan.id);
      return detail == null ? [] : [toPlanDto(detail)];
    });
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

  /**
   * La séance telle qu'un athlète a le droit de l'écrire : la sienne (scope tenant) ET dans un
   * cycle diffusé (filtre de statut). Point d'entrée unique du débrief (P4) — sans lui, l'athlète
   * pourrait débriefer une séance d'un brouillon que son coach est encore en train d'écrire.
   * Renvoie la ligne (et non un DTO) : l'appelant a besoin du `coachId` à dénormaliser.
   */
  async getPublishedSessionOrThrow(id: string): Promise<PublishedSession> {
    const session = await this.db.scheduledSession.findFirst({
      where: { id, plan: { status: PlanStatus.PUBLISHED } },
    });
    if (session == null) {
      throw new NotFoundException("Séance introuvable");
    }
    // Le destinataire est résolu ICI, au point de contrôle unique des écritures athlète : ses
    // appelants (débrief, médias, messagerie) bâtissent des clés de storage dessus et ne doivent
    // pas avoir à redemander si l'athlète existe. Sur un cycle diffusé, il existe.
    return { ...session, athleteId: athleteRecipientOrThrow(session) };
  }
}
