import {
  adoptMetrics,
  type BlockGrid,
  comparableText,
  customMetricIdsIn,
  type ExerciseBlocks,
  remapCustomMetrics,
} from "@cmv/shared";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import {
  type CustomMetricCatalog,
  toCustomMetricDto,
} from "../../custom-metric/custom-metric.mapper";
import type { TenantTx } from "../../tenancy/tenancy.extension";
import { currentActor, runAsCoach } from "../../tenancy/tenant-context.type";
import { parseGrid, toJsonInput } from "../../util/block-json.util";
import {
  parseBlocks,
  parseInstructions,
  toBlocksInput,
  toInstructionsInput,
} from "../../util/exercise-json.util";
import { withCopiedImages } from "../../util/instruction-images.util";
import type { ExerciseWithDocuments } from "../exercise.mapper";

/**
 * Ce qu'une copie reprend de sa source : le contenu, et le propriétaire dont elle cite le
 * catalogue. `catalog` est celui de ce propriétaire, lu par l'appelant AVANT sa transaction : par
 * le client de base (piège n°9), une seconde connexion tenue pendant la transaction épuiserait le
 * pool sous des copies concurrentes.
 */
export type CopySource = Pick<
  ExerciseWithDocuments,
  | "id"
  | "coachId"
  | "coach"
  | "title"
  | "description"
  | "instructions"
  | "blocks"
  | "documents"
  | "tags"
> & { catalog: CustomMetricCatalog };

/** Ce que la copie change de sa source. */
export type CopyOptions = {
  title: string;
  /** Les blocs, citant encore le catalogue de la SOURCE : la copie les réécrit vers le sien. */
  blocks: ExerciseBlocks;
  /** Les documents de la source qui suivent : tous pour une copie figée, les images pour une variante. */
  documents: CopySource["documents"];
  /** La provenance d'une copie figée ; `null` pour une variante. */
  frozen: { coachId: string; at: Date } | null;
};

/**
 * Copier un exercice dans la bibliothèque de l'ACTEUR courant (#315, #609) : « Dupliquer en
 * variante », et la copie figée qu'une séance garde de l'exercice qu'elle perd.
 *
 * Les documents suivent sous la MÊME clé objet — aucun binaire dupliqué, la garde de purge compte
 * ces lignes avant d'effacer (`DocumentCleanupService`). La consigne est réécrite vers les copies
 * de ses images. Les métriques maison citées passent du catalogue du propriétaire de la source à
 * celui de l'acteur (`adoptMetrics`) : `CustomMetric` est le catalogue d'UN Coach.
 *
 * Toutes les lectures et écritures passent par le client tenant de la transaction de l'appelant :
 * l'acteur possède tout ce qu'elles créent, l'extension l'y injecte. Le catalogue du propriétaire
 * de la source arrive avec elle (`CopySource.catalog`).
 */
@Injectable()
export class ExerciseCopyService {
  constructor(private readonly cls: ClsService) {}

  /** La copie, créée chez l'acteur courant ; rend son id. */
  async create(tx: TenantTx, source: CopySource, options: CopyOptions): Promise<string> {
    return this.write(tx, source, options, await this.adopt(tx, source, [options.blocks]));
  }

  /** `metricIds` : les métriques déjà adoptées, que `options.blocks` cite chez la source. */
  private async write(
    tx: TenantTx,
    source: CopySource,
    options: CopyOptions,
    metricIds: ReadonlyMap<string, string>,
  ): Promise<string> {
    const created = await tx.exercise.create({
      data: {
        title: options.title,
        titleSearch: comparableText(options.title),
        description: source.description,
        blocks: toBlocksInput(remapCustomMetrics(options.blocks, metricIds)),
        frozenFromCoachId: options.frozen?.coachId ?? null,
        frozenAt: options.frozen?.at ?? null,
      } satisfies Omit<
        Prisma.ExerciseUncheckedCreateInput,
        "coachId"
      > as Prisma.ExerciseUncheckedCreateInput,
    });

    // Un par un, dans l'ordre de la source : il faut l'id de chaque copie pour réécrire la
    // consigne, et leur ancienneté est l'ordre d'affichage.
    const idByOldId = new Map<string, string>();
    const documents = [...options.documents].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    for (const document of documents) {
      const copy = await tx.exerciseDocument.create({
        data: {
          exerciseId: created.id,
          type: document.type,
          usage: document.usage,
          storagePath: document.storagePath,
          url: document.url,
          fileName: document.fileName,
          mimeType: document.mimeType,
        } satisfies Omit<
          Prisma.ExerciseDocumentUncheckedCreateInput,
          "coachId"
        > as Prisma.ExerciseDocumentUncheckedCreateInput,
      });
      idByOldId.set(document.id, copy.id);
    }

    const instructions = parseInstructions(source.instructions);
    if (instructions != null) {
      await tx.exercise.update({
        where: { id: created.id },
        data: { instructions: toInstructionsInput(withCopiedImages(instructions, idByOldId)) },
      });
    }
    if (source.tags.length > 0) {
      await tx.exerciseTag.createMany({
        data: source.tags.map((tag) => ({
          exerciseId: created.id,
          name: tag.name,
        })) satisfies Omit<
          Prisma.ExerciseTagUncheckedCreateInput,
          "coachId"
        >[] as Prisma.ExerciseTagUncheckedCreateInput[],
      });
    }
    return created.id;
  }

  /**
   * La copie figée que `coachId` garde de `source`, qu'il perd (#609) : créée À SON NOM, et ses
   * séances qui citaient la source repointées vers elle, dosages conservés — leurs blocs citent
   * désormais son catalogue. Chaque séance avance d'une version : un builder resté ouvert sur
   * l'ancienne citerait un exercice disparu, il recevra « Recharger ».
   *
   * `coachId` est prouvé par l'appelant (une séance de ce Coach cite la source) ; le scope de ce
   * Coach borne ensuite ce que la copie touche — ses propres séances, rien d'autre. Rien à faire
   * s'il n'en cite plus aucune.
   */
  async freezeFor(tx: TenantTx, source: CopySource, coachId: string, at: Date): Promise<void> {
    await runAsCoach(this.cls, coachId, async () => {
      const rows = await tx.sessionExercise.findMany({
        where: { exerciseId: source.id, coachId },
        select: { id: true, sessionId: true, blocks: true, baseline: true, grid: true },
      });
      if (rows.length === 0) return;
      const lines = rows.map((row) => ({
        ...row,
        blocks: parseBlocks(row.blocks),
        baseline: parseBlocks(row.baseline),
        // La grille d'une ligne de bloc (#716) : `[]` pour une ligne de l'ancien modèle.
        grid: row.grid === null ? [] : [parseGrid(row.grid)],
      }));
      const blocks = parseBlocks(source.blocks);
      // Adoptées une fois pour la copie ET ses lignes : une ligne peut citer une métrique que
      // l'exercice ne cite plus.
      const metricIds = await this.adopt(tx, source, [
        blocks,
        ...lines.flatMap((line) => [line.blocks, line.baseline, line.grid]),
      ]);
      const copyId = await this.write(
        tx,
        source,
        {
          title: source.title,
          blocks,
          documents: source.documents,
          frozen: { coachId: source.coachId, at },
        },
        metricIds,
      );
      // `updateMany` : M a pu réenregistrer sa séance depuis la lecture, ses lignes recréées sous
      // d'autres ids. Elles citent encore la source, et la clé étrangère refusera la suppression
      // (« réessaie ») ; une réduction, elle, les laisse citer en direct (MC-16).
      for (const line of lines) {
        await tx.sessionExercise.updateMany({
          where: { id: line.id },
          data: {
            exerciseId: copyId,
            blocks: toBlocksInput(remapCustomMetrics(line.blocks, metricIds)),
            baseline: toBlocksInput(remapCustomMetrics(line.baseline, metricIds)),
            ...gridColumn(remapCustomMetrics(line.grid, metricIds)),
          },
        });
      }
      // Datée de l'écriture, pas de `at` : pris avant la transaction, il ferait reculer la version
      // d'une séance enregistrée entre-temps.
      await tx.session.updateMany({
        where: { id: { in: [...new Set(lines.map((line) => line.sessionId))] } },
        data: { updatedAt: new Date() },
      });
    });
  }

  /**
   * Les métriques que ces blocs citent chez le propriétaire de la source, adoptées dans le catalogue
   * de l'acteur courant : id chez le propriétaire → id chez l'acteur. Rien à adopter quand l'acteur
   * EST le propriétaire, ni pour une citation que son catalogue ne connaît plus (supprimée depuis,
   * dette EX-2) — elle reste telle quelle.
   */
  private async adopt(
    tx: TenantTx,
    source: CopySource,
    blocks: readonly (ExerciseBlocks | readonly BlockGrid[])[],
  ): Promise<ReadonlyMap<string, string>> {
    const cited = new Set(blocks.flatMap(customMetricIdsIn));
    if (cited.size === 0 || source.coachId === currentActor(this.cls).userId) return new Map();
    const owned = source.catalog.filter((metric) => cited.has(metric.id)).map(toCustomMetricDto);
    if (owned.length === 0) return new Map();
    const catalog = (await tx.customMetric.findMany()).map(toCustomMetricDto);
    const adoption = adoptMetrics(owned, catalog, source.coach.name);
    const ids = new Map(adoption.reused);
    for (const { sourceId, definition } of adoption.created) {
      const created = await tx.customMetric.create({
        data: {
          ...definition,
          scale: definition.scale ?? Prisma.DbNull,
        } satisfies Omit<
          Prisma.CustomMetricUncheckedCreateInput,
          "coachId"
        > as Prisma.CustomMetricUncheckedCreateInput,
      });
      ids.set(sourceId, created.id);
    }
    return ids;
  }
}

/** La grille remappée d'une ligne de bloc ; rien pour une ligne de l'ancien modèle, sans grille. */
function gridColumn([grid]: readonly BlockGrid[]): { grid?: Prisma.InputJsonValue } {
  return grid === undefined ? {} : { grid: toJsonInput(grid) };
}
