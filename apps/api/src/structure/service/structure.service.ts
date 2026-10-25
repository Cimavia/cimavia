import {
  type StructureDto,
  type StructureInput,
  type StructureLibraryDto,
  StructurePresetKey,
  type UpdateStructureInput,
  type VersionQuery,
} from "@cmv/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { TENANT_PRISMA } from "../../tenancy/tenancy.module";
import { toJsonInput } from "../../util/block-json.util";
import { deleteAtVersion, writeAtVersion } from "../../util/stale-write.util";
import { toStructureDto } from "../structure.mapper";

const STRUCTURE_NOT_FOUND = "Structure introuvable";

/** Combien de séances-types citent chaque origine : structure prête, ou structure du Coach. */
type SessionCounts = {
  byPreset: ReadonlyMap<string, number>;
  byStructure: ReadonlyMap<string, number>;
};

/**
 * Bibliothèque › Structures (#716) : les structures prêtes, que le code porte, et celles que le
 * Coach enregistre. Une structure se COPIE dans un bloc de séance, sans lien vivant : la modifier
 * ou la supprimer ne touche aucune séance — le bloc perd seulement son origine (`SetNull`).
 *
 * Privées à leur Coach (`coachOwner`) : elles ne s'ouvrent pas aux autres (#714).
 */
@Injectable()
export class StructureService {
  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrisma) {}

  async library(): Promise<StructureLibraryDto> {
    const [structures, counts] = await Promise.all([
      this.db.structure.findMany({ orderBy: { createdAt: "desc" } }),
      this.sessionCounts(),
    ]);
    return {
      presets: Object.values(StructurePresetKey).map((key) => ({
        key,
        // Absente du décompte = aucune séance ne la cite : c'est un compte, il vaut zéro.
        sessionCount: counts.byPreset.get(key) ?? 0,
      })),
      structures: structures.map((structure) =>
        toStructureDto(structure, counts.byStructure.get(structure.id) ?? 0),
      ),
    };
  }

  async get(id: string): Promise<StructureDto> {
    const structure = await this.getOwnedOrThrow(id);
    return toStructureDto(structure, await this.sessionCountOf(id));
  }

  async create(input: StructureInput): Promise<StructureDto> {
    const created = await this.db.structure.create({
      // coachId injecté par la couche d'isolation — d'où le cast.
      data: dataOf(input) satisfies Omit<
        Prisma.StructureUncheckedCreateInput,
        "coachId"
      > as Prisma.StructureUncheckedCreateInput,
    });
    // Elle naît sans séance qui la cite.
    return toStructureDto(created, 0);
  }

  /**
   * Sous la version lue (#604) : deux onglets ne s'écrasent pas. `writeAtVersion` distingue déjà
   * la structure d'un autre (404, le scope ne la voit pas) de la version dépassée (409).
   */
  async update(id: string, input: UpdateStructureInput): Promise<StructureDto> {
    await writeAtVersion(
      this.db.structure,
      id,
      new Date(input.expectedUpdatedAt),
      dataOf(input),
      STRUCTURE_NOT_FOUND,
    );
    return this.get(id);
  }

  async delete(id: string, query: VersionQuery): Promise<void> {
    await this.getOwnedOrThrow(id);
    await deleteAtVersion(
      this.db.structure,
      id,
      new Date(query.expectedUpdatedAt),
      STRUCTURE_NOT_FOUND,
    );
  }

  private async getOwnedOrThrow(id: string) {
    const structure = await this.db.structure.findFirst({ where: { id } });
    if (structure == null) {
      throw new NotFoundException(STRUCTURE_NOT_FOUND);
    }
    return structure;
  }

  /** Le compteur d'une seule structure, compté par la base : les mêmes séances que `sessionCounts`. */
  private sessionCountOf(id: string): Promise<number> {
    return this.db.session.count({ where: { blocks: { some: { sourceStructureId: id } } } });
  }

  /**
   * Le compteur « Séances » : les séances-types que le Coach peut LIRE — les siennes et celles
   * qu'on lui ouvre (#605) —, comptées une fois chacune par origine, même si plusieurs de leurs
   * blocs la citent. La lecture passe par la séance, scopée : un bloc ne se lit pas seul.
   */
  private async sessionCounts(): Promise<SessionCounts> {
    const sessions = await this.db.session.findMany({
      where: { blocks: { some: {} } },
      select: { blocks: { select: { sourcePreset: true, sourceStructureId: true } } },
    });
    const byPreset = new Map<string, number>();
    const byStructure = new Map<string, number>();
    for (const { blocks } of sessions) {
      for (const preset of new Set(blocks.flatMap((block) => block.sourcePreset ?? []))) {
        byPreset.set(preset, (byPreset.get(preset) ?? 0) + 1);
      }
      for (const id of new Set(blocks.flatMap((block) => block.sourceStructureId ?? []))) {
        byStructure.set(id, (byStructure.get(id) ?? 0) + 1);
      }
    }
    return { byPreset, byStructure };
  }
}

function dataOf(input: StructureInput) {
  return {
    name: input.name,
    tags: input.tags,
    note: input.note,
    instructions: input.instructions,
    settings: toJsonInput(input.settings),
  };
}
