import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import {
  type ExerciseBlock,
  type ExerciseBlocks,
  exerciseBlocksSchema,
} from "./exercise-block.schema";

// Surcharge de dosage à trois niveaux (#164).
//
//     EXERCICE (bibliothèque)   le défaut, valable partout
//     SÉANCE                    ajusté pour cette séance-type
//     SÉANCE PLANIFIÉE          ajusté pour UN athlète, une semaine donnée
//
// Chaque niveau part du précédent. Ce fichier ne contient que de la logique PURE : la composition
// des trois états et les quatre gestes que la maquette décrit. Les écritures, elles, vivent côté
// API — c'est elle qui possède la référence, et elle seule.

/**
 * Le niveau auquel une valeur a été touchée. La maquette leur donne des formes distinctes — rond
 * pour la séance, carré pour l'athlète — et pas seulement des couleurs : les deux marqueurs
 * coexistent sur la même grille, et une couleur seule serait illisible pour un daltonien.
 */
export const AdjustmentLevel = {
  SESSION: "SESSION",
  SCHEDULED: "SCHEDULED",
} as const;
export type AdjustmentLevel = TypesValuesOf<typeof AdjustmentLevel>;
export const adjustmentLevelSchema = z.enum(AdjustmentLevel);

/**
 * Un ajustement : le chemin de la valeur touchée, et à quel niveau.
 *
 * Le marqueur est ainsi porté par la DONNÉE, jamais déduit d'une comparaison à l'affichage. La
 * différence n'est pas théorique : un coach qui retape à la main la même valeur que le défaut a
 * bien ajusté cette cellule — il l'a décidée. Un diff ne le verrait pas.
 */
export const adjustmentSchema = z
  .object({
    path: z.string().min(1),
    level: adjustmentLevelSchema,
  })
  .strict();
export type Adjustment = z.infer<typeof adjustmentSchema>;

export const ADJUSTMENTS_MAX = 2000;
export const adjustmentsSchema = z
  .array(adjustmentSchema)
  .max(ADJUSTMENTS_MAX)
  .refine((list) => new Set(list.map((item) => item.path)).size === list.length, {
    message: "Un même chemin ne peut pas porter deux ajustements.",
  });
export type Adjustments = z.infer<typeof adjustmentsSchema>;

// ── Chemins ─────────────────────────────────────────────────────────────────────────────────

// Les identifiants sont des cuid/uuid : aucun ne contient de barre oblique, qui peut donc servir
// de séparateur sans échappement.
const SEPARATOR = "/";

/** Le chemin d'une cellule : un bloc, une ligne, une colonne. */
export function cellPath(blockId: string, rowId: string, metricId: string): string {
  return [blockId, "rows", rowId, metricId].join(SEPARATOR);
}

/** Le chemin d'un paramètre de bandeau — « 4 séries », « repos 2'30 ». */
export function structurePath(blockId: string, field: string): string {
  return [blockId, "structure", field].join(SEPARATOR);
}

/** Vrai si le chemin désigne une valeur de CETTE ligne — sert à « Revenir au défaut ». */
export function isPathInRow(path: string, blockId: string, rowId: string): boolean {
  return path.startsWith([blockId, "rows", rowId, ""].join(SEPARATOR));
}

// ── Les quatre gestes ───────────────────────────────────────────────────────────────────────

/** Le niveau du marqueur à afficher, ou `null` si la valeur est héritée telle quelle. */
export function adjustmentLevelAt(adjustments: Adjustments, path: string): AdjustmentLevel | null {
  return adjustments.find((item) => item.path === path)?.level ?? null;
}

/**
 * Marque une valeur comme ajustée. Un chemin déjà marqué au niveau SESSION et retouché au niveau
 * SCHEDULED passe au SECOND : c'est le dernier qui a la main sur ce que voit l'athlète, et le
 * marqueur doit dire qui décide aujourd'hui, pas qui a décidé en premier.
 */
export function markAdjusted(
  adjustments: Adjustments,
  path: string,
  level: AdjustmentLevel,
): Adjustments {
  return [...adjustments.filter((item) => item.path !== path), { path, level }];
}

/** Retire le marqueur d'un chemin — la valeur redevient héritée. */
export function clearAdjustment(adjustments: Adjustments, path: string): Adjustments {
  return adjustments.filter((item) => item.path !== path);
}

/**
 * « Revenir au défaut » sur une ligne : ses valeurs reprennent celles de la référence, et ses
 * marqueurs tombent.
 *
 * Une ligne AJOUTÉE au niveau séance n'existe pas dans la référence : elle est laissée telle
 * quelle. La retirer serait une suppression déguisée derrière un bouton qui dit « revenir ».
 */
export function resetRow(
  blocks: ExerciseBlocks,
  baseline: ExerciseBlocks,
  adjustments: Adjustments,
  blockId: string,
  rowId: string,
): { blocks: ExerciseBlocks; adjustments: Adjustments } {
  const baseRow = baseline
    .find((block) => block.id === blockId)
    ?.rows.find((row) => row.id === rowId);

  const nextBlocks =
    baseRow == null
      ? blocks
      : blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                rows: block.rows.map((row) =>
                  row.id === rowId ? { ...row, values: { ...baseRow.values } } : row,
                ),
              }
            : block,
        );

  return {
    blocks: nextBlocks,
    adjustments: adjustments.filter((item) => !isPathInRow(item.path, blockId, rowId)),
  };
}

/** « Tout réinitialiser » : retour aux valeurs copiées à l'ajout. La référence, elle, ne bouge pas. */
export function resetToBaseline(baseline: ExerciseBlocks): {
  blocks: ExerciseBlocks;
  adjustments: Adjustments;
} {
  // Copie explicite plutôt que `structuredClone` : ce paquet est compilé sans lib DOM ni types
  // Node, pour rester consommable tel quel par l'API, le web et React Native. Les trois niveaux
  // recopiés — bloc, ligne, valeurs — sont exactement ceux qu'une édition mute.
  return {
    blocks: baseline.map((block) => ({
      ...block,
      rows: block.rows.map((row) => ({ ...row, values: { ...row.values } })),
    })),
    adjustments: [],
  };
}

// ── Le verrou du niveau séance ──────────────────────────────────────────────────────────────

/**
 * Ce qu'une séance ne peut PAS changer par rapport à l'exercice qu'elle a copié : le type de
 * structure, le jeu de colonnes, le nombre de blocs et leurs libellés.
 *
 * Sans ce verrou, le constructeur de séance redevient le constructeur d'exercice et la notion de
 * défaut se dilue — pour changer le reste, le coach passe par « Dupliquer en variante ».
 *
 * Vérifié CÔTÉ SERVEUR et pas seulement grisé dans l'UI : un formulaire n'est pas une frontière.
 */
export function lockedShapeIssues(baseline: ExerciseBlocks, next: ExerciseBlocks): string[] {
  if (baseline.length !== next.length) return ["blockCount"];

  return next.flatMap((block, index) => {
    const base = baseline[index];
    if (base == null) return ["blockCount"];
    return blockShapeIssues(base, block);
  });
}

function blockShapeIssues(base: ExerciseBlock, next: ExerciseBlock): string[] {
  const issues: string[] = [];
  if (base.id !== next.id) issues.push(`blockId:${next.id}`);
  if (base.structure.type !== next.structure.type) issues.push(`structureType:${next.id}`);
  if (base.label !== next.label) issues.push(`blockLabel:${next.id}`);
  if (!sameMetrics(base, next)) issues.push(`metrics:${next.id}`);
  return issues;
}

/** Mêmes colonnes, dans le même ordre : réordonner une colonne change ce que l'athlète lit. */
function sameMetrics(base: ExerciseBlock, next: ExerciseBlock): boolean {
  if (base.metrics.length !== next.metrics.length) return false;
  return base.metrics.every((metric, index) => metric.id === next.metrics[index]?.id);
}

// ── L'état complet d'un exercice dosé ───────────────────────────────────────────────────────

/**
 * Ce qu'un niveau de dosage stocke : ce qui est lu, la référence dont il part, et ce qui a été
 * touché. La référence n'est PAS redondante avec les blocs — c'est elle qui rend « Tout
 * réinitialiser » possible, et c'est contre elle que le verrou est vérifié.
 */
export const dosageStateSchema = z.object({
  blocks: exerciseBlocksSchema,
  baseline: exerciseBlocksSchema,
  adjustments: adjustmentsSchema,
});
export type DosageState = z.infer<typeof dosageStateSchema>;
