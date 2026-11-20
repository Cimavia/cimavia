import type { PlanDto, PublishPlanInput } from "@cmv/shared";
import { PlanStatus } from "@cmv/shared";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { InvoiceService } from "../../invoice/service/invoice.service";
import { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { assertReadAtVersion, writeAtVersion } from "../../util/stale-write.util";
import { PLAN_NOT_FOUND, PlanService } from "./plan.service";

/**
 * La diffusion d'un cycle, à part de son édition : c'est le seul geste qui le rend visible de son
 * athlète, et qui émet sa facture.
 */
@Injectable()
export class PlanPublishService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    // Contrôles d'accès au cycle et forme rendue : source unique (PlanService).
    private readonly plans: PlanService,
    private readonly invoices: InvoiceService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Diffusion : DRAFT → PUBLISHED. C'est le seul moment où le plan devient visible de l'athlète
   * (les lectures athlète filtrent sur PUBLISHED). Pas de retour arrière en MVP : une fois
   * diffusé, le cycle s'ajuste en place (CDC §5.7), il ne repasse pas en brouillon.
   *
   * La facture du cycle est ÉMISE ici, atomiquement : passage PUBLISHED et DRAFT → PENDING dans la
   * même transaction. Sans termes de facturation saisis, `issueForPlan` lève (400) et rien n'est
   * diffusé — c'est le gating (P6). L'athlète reçoit alors deux notifications : cycle + facture.
   *
   * Sous la version affichée (#604) : le destinataire, le titre et le début sont ceux que le Coach
   * a vus en diffusant. Réaffecté entre-temps par un autre Coach, le cycle partirait sinon chez un
   * athlète qu'il n'a jamais vu à l'écran — notifié, et facturé à son nom.
   */
  async publish(id: string, input: PublishPlanInput): Promise<PlanDto> {
    const { plan, context } = await this.plans.getForOrThrow(id, "write");
    const expected = new Date(input.expectedUpdatedAt);
    // Avant tout autre refus : sur un écran périmé, le cycle est peut-être déjà diffusé, ou son
    // destinataire choisi — « relire » le montrera, « choisis l'athlète » le ferait chercher.
    assertReadAtVersion(plan.updatedAt, expected);
    if (plan.status === PlanStatus.PUBLISHED) {
      throw new ConflictException("Planification déjà diffusée");
    }

    /**
     * Le destinataire d'abord, avant le contenu et avant la facturation (#144). L'ordre n'est pas
     * cosmétique : un cycle sans athlète NI facturation échouerait sinon sur le message de
     * facturation, qui ne dit pas ce qui manque vraiment — et le coach chercherait un montant à
     * saisir là où il lui manque quelqu'un à qui parler.
     *
     * C'est aussi ce qui rend non-null tout ce qui suit : notifications et facture s'appuient
     * dessus, et `athleteRecipientOrThrow` garde les chemins que ce contrôle ne domine pas.
     */
    if (plan.athleteId == null) {
      throw new BadRequestException("Choisis l'athlète de ce cycle avant de le diffuser");
    }

    /**
     * Auto-coaching (#14) : pas de facture. Le gating existe pour qu'un coach ne diffuse pas un
     * cycle sans avoir dit ce qu'il coûte à SON ATHLÈTE — se le facturer à soi-même n'aurait
     * aucun sens, et l'exiger rendrait la diffusion solo impossible. Les notifications, elles,
     * sont filtrées plus bas par `NotificationService` : la règle « on ne s'annonce pas à
     * soi-même » y vaut pour tous les émetteurs, pas seulement pour celui-ci.
     *
     * La state machine `DRAFT → PUBLISHED`, elle, ne change PAS : c'est elle qui donne au cycle
     * ses `ScheduledSession` lisibles et débriefables, et un cycle solo doit se vivre comme les
     * autres.
     */
    const solo = isSelfCoaching(plan);

    const { invoice, published } = await this.db.$transaction(async (tx) => {
      // Conditionnée, et non lue puis écrite : la réaffectation qui passerait entre la lecture et
      // ici laisserait `plan` — donc la facture et les notifications — sur l'ancien athlète.
      await writeAtVersion(
        tx.plan,
        id,
        expected,
        { status: PlanStatus.PUBLISHED, publishedAt: new Date() },
        PLAN_NOT_FOUND,
      );
      // Les semaines comptées APRÈS l'écriture, jamais avant (#872) : une suppression du cycle
      // validée entre la lecture et ici les aurait emportées en cascade, et le cycle disparu aurait
      // répondu 400 « sans semaine » au lieu du 404 de l'écriture. Après elle, la suppression
      // attend notre verrou sur le cycle, puis bute sur la version (409). Le retrait d'une semaine,
      // lui, ne prend pas ce verrou : sa fenêtre est celle assumée en « Tranché en #312 ».
      if ((await tx.planWeek.count({ where: { planId: id } })) === 0) {
        throw new BadRequestException("Un cycle sans semaine n'a rien à diffuser");
      }
      // Gating : lève si aucune facturation n'a été saisie → la transaction est annulée.
      const issued = solo ? null : await this.invoices.issueForPlan(tx, plan);
      // Relu DANS la transaction, comme l'en-tête : la réponse porte NOTRE version.
      return { invoice: issued, published: await this.plans.getDtoFor(id, tx, context) };
    });

    // Pas de garde `solo` ici : `NotificationService` ignore déjà toute notification vers soi-même
    // (#14), et pour TOUS les émetteurs. Une règle, un endroit.
    await this.notifications.notifyPlanPublished({
      athleteId: plan.athleteId,
      planId: plan.id,
      planTitle: plan.title,
    });
    if (invoice != null) {
      await this.notifications.notifyInvoiceIssued({
        athleteId: plan.athleteId,
        invoiceId: invoice.id,
      });
    }

    return published;
  }
}

/**
 * Un cycle que le coach s'est écrit à lui-même : ni facture, ni notification (#14).
 *
 * Un cycle SANS destinataire (#144) n'est pas solo — mais `publish` l'a déjà refusé bien avant
 * d'arriver ici, ce qui est le seul endroit d'où cette question se pose.
 */
function isSelfCoaching(plan: { coachId: string; athleteId: string | null }): boolean {
  return plan.athleteId != null && plan.coachId === plan.athleteId;
}
