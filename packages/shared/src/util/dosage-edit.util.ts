import {
  type AdjustmentLevel,
  type Adjustments,
  cellPath,
  markAdjusted,
  resetRow,
  resetToBaseline,
  restoreAdjustment,
  structurePath,
} from "../dto/dosage-override.schema";
import type { ExerciseBlock, ExerciseBlocks } from "../dto/exercise-block.schema";
import type { MetricValue } from "../dto/exercise-metric.schema";

/**
 * Les gestes d'édition d'un exercice dosé, communs aux deux niveaux éditables (#518) : la séance-type
 * dans le constructeur de séance, la séance planifiée dans le panneau du cycle. Une seule mécanique
 * paramétrée par le niveau, jamais un modèle à part — la maquette le dit, et l'écrire deux fois
 * laisserait les deux écrans diverger sur ce qu'un marqueur VEUT DIRE.
 *
 * Chaque geste prend une ligne et la rend modifiée, champs propres à l'écran compris : l'appelant
 * n'a qu'à la remplacer dans sa liste.
 */

/** Ce qu'un geste lit et écrit : les valeurs, leur référence, et les marqueurs. */
export type DosageEditable = {
  blocks: ExerciseBlocks;
  baseline: ExerciseBlocks;
  adjustments: Adjustments;
};

/**
 * Le niveau qui édite, et la référence de ses MARQUEURS — ce que « Revenir au défaut » leur rend.
 * Vide au niveau séance ; les marqueurs reçus à la diffusion au niveau planifié.
 */
export type DosageScope = {
  level: AdjustmentLevel;
  reference: Adjustments;
};

type Structure = ExerciseBlock["structure"];

/** Écrit une valeur de grille ET pose son marqueur : les deux vont toujours ensemble. */
export function adjustCell<T extends DosageEditable>(
  item: T,
  scope: DosageScope,
  at: { blockId: string; rowId: string; metricId: string },
  value: MetricValue,
): T {
  return {
    ...item,
    blocks: mapRow(item.blocks, at.blockId, at.rowId, (row) => ({
      ...row,
      values: { ...row.values, [at.metricId]: value },
    })),
    // Une ligne AJOUTÉE à ce niveau n'existe pas dans la référence : sa valeur ne s'écarte d'aucun
    // défaut, donc aucun marqueur — et « Revenir au défaut » n'aurait rien à faire.
    adjustments:
      baselineRow(item.baseline, at.blockId, at.rowId) == null
        ? item.adjustments
        : markAdjusted(item.adjustments, cellPath(at.blockId, at.rowId, at.metricId), scope.level),
  };
}

/** « Revenir au défaut » sur une cellule. */
export function revertCell<T extends DosageEditable>(
  item: T,
  scope: DosageScope,
  at: { blockId: string; rowId: string; metricId: string },
): T {
  const base = baselineRow(item.baseline, at.blockId, at.rowId);
  if (base == null) return item;
  return {
    ...item,
    blocks: mapRow(item.blocks, at.blockId, at.rowId, (row) => ({
      ...row,
      values: { ...row.values, [at.metricId]: base.values[at.metricId] ?? null },
    })),
    adjustments: restoreAdjustment(
      item.adjustments,
      scope.reference,
      cellPath(at.blockId, at.rowId, at.metricId),
    ),
  };
}

/**
 * Un paramètre de bandeau — « 4 séries », « repos 2'30 ».
 *
 * Marqué CHAMP PAR CHAMP, en comparant à la référence : marquer « le bandeau » en bloc rendrait
 * « Revenir au défaut » incapable de dire lequel des paramètres il annule, et un retour manuel à
 * la valeur d'origine ne rendrait jamais le marqueur d'origine. Un bloc absent de la référence —
 * celui d'un exercice tout juste ajouté — ne porte aucun marqueur, comme une ligne ajoutée.
 */
export function adjustStructure<T extends DosageEditable>(
  item: T,
  scope: DosageScope,
  blockId: string,
  structure: Structure,
): T {
  const base = item.baseline.find((block) => block.id === blockId)?.structure;
  const adjustments =
    base == null
      ? item.adjustments
      : structureFields(structure).reduce((current, field) => {
          const path = structurePath(blockId, field);
          return readField(base, field) === readField(structure, field)
            ? restoreAdjustment(current, scope.reference, path)
            : markAdjusted(current, path, scope.level);
        }, item.adjustments);

  return {
    ...item,
    blocks: mapBlock(item.blocks, blockId, (block) => ({ ...block, structure })),
    adjustments,
  };
}

/** « Revenir au défaut » sur un paramètre de bandeau. */
export function revertStructureField<T extends DosageEditable>(
  item: T,
  scope: DosageScope,
  blockId: string,
  field: string,
): T {
  const base = item.baseline.find((block) => block.id === blockId)?.structure;
  if (base == null) return item;
  return {
    ...item,
    blocks: mapBlock(item.blocks, blockId, (block) => ({
      ...block,
      structure: { ...block.structure, [field]: readField(base, field) } as Structure,
    })),
    adjustments: restoreAdjustment(
      item.adjustments,
      scope.reference,
      structurePath(blockId, field),
    ),
  };
}

/** Le nombre de lignes d'un bloc : ajouter ou retirer une ligne ne pose aucun marqueur. */
export function adjustRows<T extends DosageEditable>(
  item: T,
  blockId: string,
  rows: ExerciseBlock["rows"],
): T {
  return {
    ...item,
    blocks: mapBlock(item.blocks, blockId, (block) => ({ ...block, rows })),
  };
}

/** « Revenir au défaut » sur une ligne entière. */
export function revertRow<T extends DosageEditable>(
  item: T,
  scope: DosageScope,
  blockId: string,
  rowId: string,
): T {
  return {
    ...item,
    ...resetRow(item.blocks, item.baseline, item.adjustments, scope.reference, blockId, rowId),
  };
}

/** « Tout réinitialiser » : les valeurs de la référence, les marqueurs de la référence. */
export function resetAllAdjustments<T extends DosageEditable>(item: T, scope: DosageScope): T {
  return { ...item, ...resetToBaseline(item.baseline, scope.reference) };
}

/** Transforme le SEUL bloc visé : les autres blocs de l'exercice restent tels quels. */
function mapBlock(
  blocks: ExerciseBlocks,
  blockId: string,
  change: (block: ExerciseBlock) => ExerciseBlock,
): ExerciseBlocks {
  return blocks.map((block) => (block.id === blockId ? change(block) : block));
}

function mapRow(
  blocks: ExerciseBlocks,
  blockId: string,
  rowId: string,
  change: (row: ExerciseBlock["rows"][number]) => ExerciseBlock["rows"][number],
): ExerciseBlocks {
  return mapBlock(blocks, blockId, (block) => ({
    ...block,
    rows: block.rows.map((row) => (row.id === rowId ? change(row) : row)),
  }));
}

function baselineRow(baseline: ExerciseBlocks, blockId: string, rowId: string) {
  return baseline.find((block) => block.id === blockId)?.rows.find((row) => row.id === rowId);
}

/** Les champs surchargeables d'un bandeau. `type` n'en est pas un : il est verrouillé. */
function structureFields(structure: Structure): string[] {
  return Object.keys(structure).filter((field) => field !== "type");
}

function readField(structure: Structure, field: string): unknown {
  return (structure as unknown as Record<string, unknown>)[field];
}
