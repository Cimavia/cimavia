import type { CreateCustomMetricInput, CustomMetric, UpdateCustomMetricInput } from "@cmv/shared";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toCustomMetricDto } from "../custom-metric.mapper";

/**
 * Métriques et échelles maison du coach (#162, item 5). Elles vivent au niveau du COACH et non de
 * l'exercice : une cotation inventée une fois sert dans toute la bibliothèque.
 *
 * Les blocs les référencent par `customMetricId` DANS du JSON — ce n'est donc pas une clé
 * étrangère, et supprimer une métrique laisse des colonnes orphelines que `validateBlockValues`
 * signale à l'affichage. Choix assumé : dette R-2.
 */
@Injectable()
export class CustomMetricService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

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
    const metrics = await this.db.customMetric.findMany({ orderBy: { label: "asc" } });
    return metrics.map(toCustomMetricDto);
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictException("Une métrique porte déjà ce nom");
      }
      throw error;
    }
  }
}

const UNIQUE_VIOLATION = "P2002";

/**
 * `Prisma.DbNull` et non `null` : sur une colonne JSON nullable, le NULL SQL et le littéral JSON
 * `null` sont deux valeurs distinctes, et seule la première veut dire « pas d'échelle ».
 */
function toScaleInput(
  scale: CreateCustomMetricInput["scale"],
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return scale === null ? Prisma.DbNull : scale;
}
