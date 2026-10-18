import type { AccessLevel, ChangeAccessInput, CoachChange, ElementAccessDto } from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import {
  type AccessContext,
  type AccessRow,
  GRANT_BENEFICIARY_SELECT,
  toAccessView,
  toCoachGrantDtos,
  toGrantDtos,
} from "../access.mapper";
import { AccessService } from "./access.service";

/** La colonne de `AccessGrant` qui désigne la cible : un exercice, une séance ou un cycle. */
export type AccessTarget = "exerciseId" | "sessionId" | "planId";

/**
 * Un changement prêt à écrire. `level: null` supprime la ligne ; `NONE` n'arrive que d'un cycle,
 * où « Aucun » s'écrit pour que le droit par défaut ne rouvre pas l'entreprise (#607).
 */
export type GrantChange = { organizationId: string; level: AccessLevel | null };

/** Ce qu'il faut écrire : les changements d'entreprise, et ceux des Coachs (#608). */
export type GrantChanges = {
  ids: readonly string[];
  changes: readonly GrantChange[];
  coachChanges: readonly CoachChange[];
};

const GRANT_SELECT = {
  exerciseId: true,
  sessionId: true,
  planId: true,
  ...GRANT_BENEFICIARY_SELECT,
} satisfies Prisma.AccessGrantSelect;

/** Le bénéficiaire d'une ligne, tel que `AccessGrant` le désigne. */
type Beneficiary = { organizationId: string } | { coachId: string };

function onTargets(target: AccessTarget, ids: readonly string[]): Prisma.AccessGrantWhereInput {
  return { [target]: { in: [...ids] } };
}

/**
 * Changer les droits d'éléments de la bibliothèque (#605, maquette #597). Le service de la cible
 * lit ses éléments et pose ses propres refus (la réduction qui orphelinerait une séance, pour un
 * exercice) ; celui-ci vérifie le geste et écrit.
 */
@Injectable()
export class AccessGrantService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly access: AccessService,
  ) {}

  /**
   * `rows` : les éléments de `ids` que la lecture SCOPÉE a rendus. Un manquant est illisible (404,
   * sans dire lequel) ; un élément lisible mais pas à soi, 403 ; une entreprise dont le
   * propriétaire n'est pas membre, 400 — on n'ouvre son travail qu'à ses associés.
   *
   * Retirer la ligne d'une entreprise quittée reste permis : ce n'est pas un accès qu'on ouvre.
   *
   * La ligne d'un Coach (#608) ne se pose — `NONE` compris — que pour un Coach de ses entreprises,
   * autre que lui : 400 sinon. La retirer (« Hérité ») reste permis, comme pour une entreprise.
   *
   * Rend le contexte lu, ses entreprises comprises : l'appelant n'a pas à les relire.
   */
  async assertCanShare(
    { ids, changes, coachChanges }: ChangeAccessInput,
    rows: readonly AccessRow[],
  ): Promise<AccessContext> {
    const found = new Set(rows.map((row) => row.id));
    if (ids.some((id) => !found.has(id))) {
      throw new NotFoundException("Un ou plusieurs éléments sont introuvables");
    }
    const context = await this.access.context();
    for (const row of rows) this.access.assertCan(toAccessView(row, context), "share");
    if (changes.some((c) => c.level != null && !context.organizationIds.has(c.organizationId))) {
      throw new BadRequestException(
        "Tu ne peux ouvrir un accès qu'à une entreprise dont tu es membre",
      );
    }
    const set = coachChanges.filter((change) => change.level != null);
    if (set.length > 0) {
      const colleagues = await this.colleaguesOf(context);
      if (set.some((change) => !colleagues.has(change.coachId))) {
        throw new BadRequestException(
          "Tu ne peux régler l'accès que d'un Coach de tes entreprises, autre que toi",
        );
      }
    }
    return context;
  }

  /** Les Coachs des entreprises de l'acteur, lui excepté. */
  private async colleaguesOf(context: AccessContext): Promise<Set<string>> {
    const organizations = await this.access.organizationsOf(context.organizationIds);
    const colleagues = new Set(
      organizations.flatMap((organization) => organization.coaches.map((coach) => coach.coachId)),
    );
    colleagues.delete(context.actorId);
    return colleagues;
  }

  /**
   * N'écrit que les bénéficiaires changés (tranché en #597) : une ligne laissée « Mixte » n'y est
   * pas, et chaque élément garde la sienne. `null` supprime la ligne — « Aucun » pour une
   * entreprise, « Hérité » pour un Coach (#608). Tout ou rien, dans une transaction.
   *
   * Le tenant client ne touche que les lignes dont l'acteur est le propriétaire (`ownerId`), et
   * les crée à son nom : à n'appeler qu'après `assertCanShare`.
   */
  async apply(
    target: AccessTarget,
    { ids, changes, coachChanges }: GrantChanges,
  ): Promise<ElementAccessDto[]> {
    const lines: { beneficiary: Beneficiary; level: AccessLevel | null }[] = [
      ...changes.map(({ organizationId, level }) => ({ beneficiary: { organizationId }, level })),
      ...coachChanges.map(({ coachId, level }) => ({ beneficiary: { coachId }, level })),
    ];
    await this.db.$transaction(async (tx) => {
      for (const { beneficiary, level } of lines) {
        const where = { ...onTargets(target, ids), ...beneficiary };
        if (level == null) {
          await tx.accessGrant.deleteMany({ where });
          continue;
        }
        // Créer les lignes manquantes, puis aligner toutes les lignes : une ligne déjà là garde
        // son id, et l'unicité (cible, bénéficiaire) tient même sous deux requêtes concurrentes.
        await tx.accessGrant.createMany({
          data: ids.map((id) => ({ [target]: id, ...beneficiary, level })) as Omit<
            Prisma.AccessGrantUncheckedCreateInput,
            "ownerId"
          >[] as Prisma.AccessGrantUncheckedCreateInput[],
          skipDuplicates: true,
        });
        await tx.accessGrant.updateMany({ where, data: { level } });
      }
    });
    return this.read(target, ids);
  }

  /** Les droits de chaque élément, dans l'ordre de `ids` : ce que le panneau relit. */
  private async read(target: AccessTarget, ids: readonly string[]): Promise<ElementAccessDto[]> {
    const grants = await this.db.accessGrant.findMany({
      where: onTargets(target, ids),
      select: GRANT_SELECT,
    });
    return ids.map((id) => {
      const own = grants.filter((grant) => grant[target] === id);
      return { id, grants: toGrantDtos(own), coachGrants: toCoachGrantDtos(own) };
    });
  }
}
