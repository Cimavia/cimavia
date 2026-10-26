import {
  type CreateCustomMetricInput,
  type CustomMetric,
  customMetricIdsIn,
  type MetricCitations,
  type UpdateCustomMetricInput,
} from "@cmv/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { isUniqueViolation } from "../../infra/prisma/prisma-error";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import {
  type CatalogOf,
  type CustomMetricCatalog,
  toCustomMetricDto,
} from "../custom-metric.mapper";

/**
 * Métriques et échelles maison du coach (#162, item 5). Elles vivent au niveau du COACH et non de
 * l'exercice : une cotation inventée une fois sert dans toute la bibliothèque.
 *
 * Les blocs les référencent par `customMetricId` DANS du JSON — ce n'est donc pas une clé
 * étrangère, et supprimer une métrique laisse des colonnes orphelines que `validateBlockValues`
 * signale à l'affichage. Choix assumé : dette EX-2.
 */
@Injectable()
export class CustomMetricService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrisma,
    private readonly prisma: PrismaService,
  ) {}

  private async getOwnedOrThrow(id: string) {
    const metric = await this.db.customMetric.findFirst({ where: { id } });
    if (metric == null) {
      throw new NotFoundException("Métrique introuvable");
    }
    return metric;
  }

  /**
   * Triées par libellé : c'est l'ordre du sélecteur de métriques, et l'ordre d'insertion n'a
   * aucun sens pour une liste que le coach parcourt à l'œil.
   */
  async list(): Promise<CustomMetric[]> {
    return (await this.ownCatalog()).map(toCustomMetricDto);
  }

  /** Le catalogue de l'acteur, par le client tenant : celui qu'un exercice qu'il crée citera. */
  ownCatalog(): Promise<CustomMetricCatalog> {
    return this.db.customMetric.findMany({ orderBy: { label: "asc" } });
  }

  /**
   * Le catalogue de chaque Coach demandé (#605, piège n°9). Les blocs d'un exercice citent les
   * métriques de SON propriétaire : lues chez l'acteur, celles de l'exercice de C seraient
   * introuvables pour M, et ses colonnes n'afficheraient qu'un identifiant.
   *
   * Par le client de BASE : le catalogue d'un autre Coach est hors du scope de l'acteur, et aucune
   * relation ne le relie à l'exercice — les blocs citent les métriques dans du JSON. Sûr à une
   * condition, tenue par chaque appelant : les ids sont les propriétaires d'éléments que l'acteur
   * vient de lire par une requête SCOPÉE, jamais une entrée client. C'est ce que l'écart de #605
   * accepte : qui lit un exercice de C lit le catalogue de C, libellés et échelles compris.
   */
  async catalogOf(coachIds: readonly string[]): Promise<CatalogOf> {
    const owners = [...new Set(coachIds)];
    const rows =
      owners.length === 0
        ? []
        : await this.prisma.customMetric.findMany({
            where: { coachId: { in: owners } },
            orderBy: { label: "asc" },
          });
    // Groupées une fois : une page appelle la fonction par exercice, ou par ligne de séance.
    const byOwner = new Map<string, typeof rows>();
    for (const metric of rows) {
      const catalog = byOwner.get(metric.coachId);
      if (catalog == null) byOwner.set(metric.coachId, [metric]);
      else catalog.push(metric);
    }
    return (coachId) => byOwner.get(coachId) ?? [];
  }

  /** Le catalogue d'un seul Coach, en DTO : le sélecteur de métriques d'un exercice. */
  async catalogDtosOf(coachId: string): Promise<CustomMetric[]> {
    return (await this.catalogOf([coachId]))(coachId).map(toCustomMetricDto);
  }

  async create(input: CreateCustomMetricInput): Promise<CustomMetric> {
    return this.write(() =>
      this.db.customMetric.create({
        data: {
          label: input.label,
          unit: input.unit,
          valueType: input.valueType,
          scale: toScaleInput(input.scale),
        } satisfies Omit<
          Prisma.CustomMetricUncheckedCreateInput,
          "coachId"
        > as Prisma.CustomMetricUncheckedCreateInput,
      }),
    );
  }

  /**
   * Remplacement intégral de la définition — le schéma partagé n'accepte pas de patch partiel,
   * parce que `valueType` et `scale` sont liés par un invariant.
   */
  async update(id: string, input: UpdateCustomMetricInput): Promise<CustomMetric> {
    await this.getOwnedOrThrow(id);
    return this.write(() =>
      this.db.customMetric.update({
        where: { id },
        data: {
          label: input.label,
          unit: input.unit,
          valueType: input.valueType,
          scale: toScaleInput(input.scale),
        },
      }),
    );
  }

  async delete(id: string): Promise<void> {
    await this.getOwnedOrThrow(id);
    await this.db.customMetric.delete({ where: { id } });
  }

  /**
   * `@@unique([coachId, label])` : deux métriques de même nom rendraient le sélecteur illisible.
   * On traduit la violation en 409 avec son motif, plutôt que de laisser filer un 500 opaque.
   */
  private async write(operation: () => Promise<Parameters<typeof toCustomMetricDto>[0]>) {
    try {
      return toCustomMetricDto(await operation());
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("Une métrique porte déjà ce nom");
      }
      throw error;
    }
  }
}

/**
 * Une écriture d'exercice — ses blocs comme ses métriques suggérées (#718) — ne cite que des
 * métriques du catalogue de son propriétaire (#605), ou 400. Sinon un rédacteur poserait les
 * siennes dans l'exercice de C, que C et ses autres lecteurs ne sauraient pas afficher.
 *
 * Seules les citations NOUVELLES se vérifient : une métrique supprimée depuis laisse une colonne
 * orpheline (dette EX-2), et la refuser bloquerait tout enregistrement de l'exercice qui la porte.
 */
export function assertCitesCatalog(
  blocks: MetricCitations,
  before: MetricCitations,
  catalog: CustomMetricCatalog,
): void {
  const known = new Set([...customMetricIdsIn(before), ...catalog.map((metric) => metric.id)]);
  if (customMetricIdsIn(blocks).some((id) => !known.has(id))) {
    throw new BadRequestException(
      "Une métrique maison citée n'existe pas dans le catalogue du propriétaire de l'exercice",
    );
  }
}

/**
 * `Prisma.DbNull` et non `null` : sur une colonne JSON nullable, le NULL SQL et le littéral JSON
 * `null` sont deux valeurs distinctes, et seule la première veut dire « pas d'échelle ».
 */
function toScaleInput(
  scale: CreateCustomMetricInput["scale"],
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return scale ?? Prisma.DbNull;
}
