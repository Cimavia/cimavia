import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import { required } from "../util/invariant.util";
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
 *
 * Un marqueur existant est remplacé À SA PLACE, pas déplacé en fin de liste : retoucher puis
 * revenir doit rendre la liste d'origine à l'identique, sans quoi l'écran se croirait modifié
 * alors que rien n'a changé (#327).
 */
export function markAdjusted(
  adjustments: Adjustments,
  path: string,
  level: AdjustmentLevel,
): Adjustments {
  const marker = { path, level };
  return adjustments.some((item) => item.path === path)
    ? adjustments.map((item) => (item.path === path ? marker : item))
    : [...adjustments, marker];
}

/** Retire le marqueur d'un chemin — la valeur redevient héritée. */
export function clearAdjustment(adjustments: Adjustments, path: string): Adjustments {
  return adjustments.filter((item) => item.path !== path);
}

/**
 * Rend à un chemin le marqueur qu'il portait dans la RÉFÉRENCE des marqueurs — ou aucun s'il n'en
 * portait pas. C'est le marqueur de « Revenir au défaut » (#518).
 *
 * La référence est vide au niveau séance : la valeur redevient celle de la bibliothèque, sans
 * marqueur, et ce geste vaut alors `clearAdjustment`. Au niveau planifié, elle porte les marqueurs
 * REÇUS à la diffusion (`baselineAdjustments`) : la valeur redevient celle de la séance-type, qui
 * peut être elle-même un ajustement — l'effacer ferait passer +12 kg décidés dans la séance pour la
 * valeur de la bibliothèque.
 */
export function restoreAdjustment(
  adjustments: Adjustments,
  reference: Adjustments,
  path: string,
): Adjustments {
  return restoreWhere(adjustments, reference, (candidate) => candidate === path);
}

/** Combien de valeurs ont été touchées À CE NIVEAU — les marqueurs hérités ne comptent pas. */
export function adjustmentCount(adjustments: Adjustments, level: AdjustmentLevel): number {
  return adjustments.filter((item) => item.level === level).length;
}

/**
 * Les chemins retenus par `matches` reprennent le marqueur de la référence ; les autres ne bougent
 * pas. Remplacés en place, et ceux de la référence absents d'ici ajoutés à la fin.
 */
function restoreWhere(
  adjustments: Adjustments,
  reference: Adjustments,
  matches: (path: string) => boolean,
): Adjustments {
  const referenceOf = (path: string) => reference.find((item) => item.path === path);
  const kept = adjustments.flatMap((item) => {
    if (!matches(item.path)) return [item];
    const restored = referenceOf(item.path);
    return restored == null ? [] : [restored];
  });
  const missing = reference.filter(
    (item) => matches(item.path) && !kept.some((current) => current.path === item.path),
  );
  return [...kept, ...missing];
}

/**
 * « Revenir au défaut » sur une ligne : ses valeurs reprennent celles de la référence, et ses
 * marqueurs ceux de la référence des marqueurs (`restoreAdjustment`) — aucun au niveau séance.
 *
 * Une ligne AJOUTÉE au niveau séance n'existe pas dans la référence : elle est laissée telle
 * quelle. La retirer serait une suppression déguisée derrière un bouton qui dit « revenir ».
 */
export function resetRow(
  blocks: ExerciseBlocks,
  baseline: ExerciseBlocks,
  adjustments: Adjustments,
  reference: Adjustments,
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
    adjustments: restoreWhere(adjustments, reference, (path) => isPathInRow(path, blockId, rowId)),
  };
}

/**
 * « Tout réinitialiser » : retour aux valeurs copiées à l'ajout, et aux marqueurs de la référence
 * des marqueurs — aucun au niveau séance, ceux reçus à la diffusion au niveau planifié. La
 * référence, elle, ne bouge pas.
 */
export function resetToBaseline(
  baseline: ExerciseBlocks,
  reference: Adjustments,
): {
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
    adjustments: [...reference],
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

  // Longueurs égales juste au-dessus : chaque bloc a son homologue au même rang.
  return next.flatMap((block, index) =>
    blockShapeIssues(required(baseline[index], `bloc de référence absent au rang ${index}`), block),
  );
}

function blockShapeIssues(base: ExerciseBlock, next: ExerciseBlock): string[] {
  const issues: string[] = [];
  if (base.id !== next.id) issues.push(`blockId:${next.id}`);
  if (base.structure.type !== next.structure.type) issues.push(`structureType:${next.id}`);
  if (base.label !== next.label) issues.push(`blockLabel:${next.id}`);
  if (!sameMetrics(base, next)) issues.push(`metrics:${next.id}`);
  return issues;
}

/**
 * Mêmes colonnes, dans le même ordre. Réordonner change ce que l'athlète lit ; changer l'UNITÉ
 * change ce qu'il comprend — « 6 » en kilos et « 6 » en pourcentage du poids de corps ne sont pas
 * le même effort.
 *
 * `collapsed` est exclu de la comparaison : c'est un état d'AFFICHAGE, pas une nature de donnée,
 * et le coach doit pouvoir replier une colonne dans sa séance sans que le verrou s'y oppose.
 */
function sameMetrics(base: ExerciseBlock, next: ExerciseBlock): boolean {
  if (base.metrics.length !== next.metrics.length) return false;
  return base.metrics.every((metric, index) =>
    sameMetricDefinition(metric, required(next.metrics[index], `colonne absente au rang ${index}`)),
  );
}

function sameMetricDefinition(
  base: ExerciseBlock["metrics"][number],
  next: ExerciseBlock["metrics"][number],
): boolean {
  if (base.id !== next.id || base.label !== next.label) return false;
  // Changer de source, c'est changer de mesure : chaque branche exige la même des deux côtés.
  if (base.source === "CATALOG") {
    return next.source === "CATALOG" && base.key === next.key && base.unit === next.unit;
  }
  return next.source === "CUSTOM" && base.customMetricId === next.customMetricId;
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
