import type { AccessLevel, ChangeAccessInput, ElementAccessDto } from "@cmv/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { type AccessContext, type AccessRow, toAccessView, toGrantDtos } from "../access.mapper";
import { AccessService } from "./access.service";

/** La colonne de `AccessGrant` qui désigne la cible : un exercice, une séance ou un cycle. */
export type AccessTarget = "exerciseId" | "sessionId" | "planId";

/**
 * Un changement prêt à écrire. `level: null` supprime la ligne ; `NONE` n'arrive que d'un cycle,
 * où « Aucun » s'écrit pour que le droit par défaut ne rouvre pas l'entreprise (#607).
 */
export type GrantChange = { organizationId: string; level: AccessLevel | null };

const GRANT_SELECT = {
  exerciseId: true,
  sessionId: true,
  planId: true,
  level: true,
  organization: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.AccessGrantSelect;

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
   * Rend le contexte lu, ses entreprises comprises : l'appelant n'a pas à les relire.
   */
  async assertCanShare(
    { ids, changes }: ChangeAccessInput,
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
    return context;
  }

  /**
   * N'écrit que les bénéficiaires de `changes` (tranché en #597) : une ligne laissée « Mixte »
   * n'y est pas, et chaque élément garde la sienne. « Aucun » supprime la ligne de l'entreprise.
   * Tout ou rien, dans une transaction.
   *
   * Le tenant client ne touche que les lignes dont l'acteur est le propriétaire (`ownerId`), et
   * les crée à son nom : à n'appeler qu'après `assertCanShare`.
   */
  async apply(
    target: AccessTarget,
    { ids, changes }: { ids: readonly string[]; changes: readonly GrantChange[] },
  ): Promise<ElementAccessDto[]> {
    await this.db.$transaction(async (tx) => {
      for (const { organizationId, level } of changes) {
        const where = { ...onTargets(target, ids), organizationId };
        if (level == null) {
          await tx.accessGrant.deleteMany({ where });
          continue;
        }
        // Créer les lignes manquantes, puis aligner toutes les lignes : une ligne déjà là garde
        // son id, et l'unicité (cible, bénéficiaire) tient même sous deux requêtes concurrentes.
        await tx.accessGrant.createMany({
          data: ids.map((id) => ({ [target]: id, organizationId, level })) as Omit<
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

  /** Les droits d'entreprise de chaque élément, dans l'ordre de `ids` : ce que le panneau relit. */
  private async read(target: AccessTarget, ids: readonly string[]): Promise<ElementAccessDto[]> {
    const grants = await this.db.accessGrant.findMany({
      where: { ...onTargets(target, ids), organizationId: { not: null } },
      select: GRANT_SELECT,
    });
    return ids.map((id) => ({
      id,
      grants: toGrantDtos(grants.filter((grant) => grant[target] === id)),
    }));
  }
}
