import type { ChangeAccessInput, CoachOrganizationDto, ElementAccessDto } from "@cmv/shared";
import {
  AccessLevel,
  CoachAthleteStatus,
  defaultPlanGrant,
  eligibleOrganizations,
} from "@cmv/shared";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { ACCESS_INCLUDE, type AccessRow } from "../../access/access.mapper";
import { AccessService } from "../../access/service/access.service";
import { AccessGrantService, type GrantChange } from "../../access/service/access-grant.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import type { TenantPrisma, TenantTx } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";

/** Les entreprises éligibles d'un cycle, selon son athlète (`null` : pas encore d'athlète). */
type Eligibility = (athleteId: string | null) => CoachOrganizationDto[];

/**
 * Les droits d'accès d'une planification (#607) : à qui le propriétaire peut l'ouvrir, ce qu'il
 * en change, et l'Écriture posée par défaut quand le cycle naît pour un athlète suivi via une
 * entreprise, ou lui est affecté.
 *
 * Un droit ne vaut que pour les Coachs de l'athlète du cycle : une entreprise n'est éligible que
 * si un autre de ses Coachs le suit (`eligibleOrganizations`). Les liens des autres Coachs sont
 * hors du scope du propriétaire ; ils se lisent par le client de BASE, sur les seuls athlètes de
 * cycles qu'il vient d'être prouvé posséder, et ne ressortent que filtrés par ses entreprises.
 */
@Injectable()
export class PlanAccessService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly grants: AccessGrantService,
  ) {}

  /** Les entreprises auxquelles le propriétaire peut ouvrir ce cycle — déjà prouvé à lui. */
  async eligibleFor(plan: { athleteId: string | null }): Promise<CoachOrganizationDto[]> {
    const eligible = await this.eligibility(plan.athleteId == null ? [] : [plan.athleteId]);
    return eligible(plan.athleteId);
  }

  /**
   * Changer les droits de cycles (#607), propriétaire seul. En plus des refus de la bibliothèque,
   * une entreprise qu'on OUVRE doit être éligible sur chaque cycle : 400 sinon — personne d'autre
   * n'y suit l'athlète, le droit n'ouvrirait rien.
   *
   * « Aucun » s'écrit `NONE` sur une entreprise dont le propriétaire est membre : fermée exprès, le
   * droit par défaut ne la rouvre pas à la réaffectation. Celle d'une entreprise quittée disparaît,
   * comme dans la bibliothèque : il n'y a plus rien à protéger.
   */
  async changeAccess(input: ChangeAccessInput): Promise<ElementAccessDto[]> {
    const plans = await this.db.plan.findMany({
      where: { id: { in: input.ids } },
      include: ACCESS_INCLUDE,
    });
    await this.grants.assertCanShare(input, plans);

    const eligible = await this.eligibility(athletesOf(plans));
    const opened = input.changes.filter((change) => change.level != null);
    for (const plan of plans) {
      const eligibleIds = new Set(eligible(plan.athleteId).map((organization) => organization.id));
      if (opened.some((change) => !eligibleIds.has(change.organizationId))) {
        throw new BadRequestException(
          "Personne d'autre dans cette entreprise ne suit l'athlète de ce cycle",
        );
      }
    }

    // Membre ou pas, c'est la liste de SES entreprises qui le dit — la même que l'éligibilité.
    const memberOf = new Set(eligible(null).map((organization) => organization.id));
    const changes: GrantChange[] = input.changes.map(({ organizationId, level }) => ({
      organizationId,
      level: level ?? (memberOf.has(organizationId) ? AccessLevel.NONE : null),
    }));
    return this.grants.apply("planId", { ids: input.ids, changes });
  }

  /**
   * L'entreprise à qui ouvrir en Écriture le cycle qui naît pour `athleteId`, ou lui est affecté :
   * celle par laquelle passe le lien du propriétaire, si elle est éligible et pas déjà réglée sur
   * le cycle (`settled`, « Aucun » compris). `null` : rien à poser.
   *
   * Lue AVANT la transaction qui l'écrit (`grantDefault`) : rien ici ne dépend du cycle, et la
   * transaction ne tient pas sa connexion pendant ces lectures.
   */
  async defaultOrganization(
    athleteId: string,
    settled: ReadonlySet<string>,
  ): Promise<string | null> {
    // Le lien du propriétaire (scope `coachOwner`) ; aucun pour l'auto-coaching (#14).
    const link = await this.db.coachAthlete.findFirst({
      where: { athleteId, status: CoachAthleteStatus.ACTIVE },
      select: { organizationId: true },
    });
    if (link?.organizationId == null) return null;
    const eligible = await this.eligibility([athleteId]);
    return defaultPlanGrant(link.organizationId, eligible(athleteId), settled);
  }

  /**
   * Pose le droit par défaut DANS la transaction de la création ou de l'affectation. Une ligne
   * écrite entre-temps — un « Aucun » réglé par un autre onglet — l'emporte : `skipDuplicates`.
   */
  async grantDefault(tx: TenantTx, planId: string, organizationId: string | null): Promise<void> {
    if (organizationId == null) return;
    // `ownerId` injecté par l'extension : le propriétaire, seul à créer ou affecter le cycle.
    await tx.accessGrant.createMany({
      data: [
        { planId, organizationId, level: AccessLevel.WRITE } satisfies Omit<
          Prisma.AccessGrantUncheckedCreateInput,
          "ownerId"
        > as Prisma.AccessGrantUncheckedCreateInput,
      ],
      skipDuplicates: true,
    });
  }

  /**
   * Les entreprises du propriétaire, et de quoi les réduire aux Coachs de chaque athlète. Les
   * `athleteIds` doivent être ceux de cycles ou de liens déjà prouvés à lui.
   */
  private async eligibility(athleteIds: readonly string[]): Promise<Eligibility> {
    const [organizations, links] = await Promise.all([
      this.access.myOrganizations(),
      athleteIds.length === 0
        ? []
        : this.prisma.coachAthlete.findMany({
            where: { athleteId: { in: [...athleteIds] }, status: CoachAthleteStatus.ACTIVE },
            select: { athleteId: true, coachId: true },
          }),
    ]);
    const ownerId = this.access.actorId();
    return (athleteId) =>
      eligibleOrganizations(
        organizations,
        athleteId == null
          ? null
          : new Set(links.filter((l) => l.athleteId === athleteId).map((l) => l.coachId)),
        ownerId,
      );
  }
}

/** Les entreprises déjà réglées sur un cycle, « Aucun » compris : le défaut ne les rouvre pas. */
export function settledOrganizations(plan: AccessRow): Set<string> {
  return new Set(
    plan.accessGrants.flatMap((grant) =>
      grant.organization == null ? [] : [grant.organization.id],
    ),
  );
}

function athletesOf(plans: readonly { athleteId: string | null }[]): string[] {
  return [...new Set(plans.flatMap((plan) => (plan.athleteId == null ? [] : [plan.athleteId])))];
}
