import { z } from "zod";
import {
  BLOCK_LABEL_MAX_LENGTH,
  BLOCK_MAX_METRICS,
  catalogMetricShape,
  customMetricShape,
  distinctColumnIds,
  distinctRowIds,
  MetricSource,
  metricUnitRefinement,
} from "./exercise-block.schema";
import { metricValueSchema } from "./exercise-metric.schema";
import { STRUCTURE_MAX_ROUNDS } from "./structure.schema";
import type { SuggestedMetric } from "./suggested-metric.schema";

// La grille d'un exercice de bloc (#715) : ses colonnes et ses lignes de valeurs.
//
// Reprend la grille de `exercise-block.schema` sans le repli de colonne (`collapsed`), que le
// modèle par blocs n'a plus, et en partage les formes et les bornes. Seul écart : le libellé de
// colonne est taillé ici, pas dans l'ancienne grille, dont les données stockées ne changent pas.
// L'ancienne grille tombe avec #723, qui rapatrie ici formes et bornes ; les noms `GRID_*` sont
// ceux qui restent.

export const GRID_MAX_METRICS = BLOCK_MAX_METRICS;
export const GRID_LABEL_MAX_LENGTH = BLOCK_LABEL_MAX_LENGTH;
/** Une ligne par tour, série ou passage : autant que de tours au plus. */
export const GRID_MAX_ROWS = STRUCTURE_MAX_ROUNDS;

// ── La grille ───────────────────────────────────────────────────────────────────────────────

/** `label` remplace l'en-tête par défaut quand le Coach le renseigne (« Voie » plutôt que « Libellé »). */
const gridMetricBase = {
  id: z.string().min(1),
  label: z.string().trim().min(1).max(GRID_LABEL_MAX_LENGTH).nullable(),
};

export const gridMetricSchema = z.discriminatedUnion("source", [
  z
    .object({ ...gridMetricBase, ...catalogMetricShape })
    .strict()
    .refine(...metricUnitRefinement),
  z.object({ ...gridMetricBase, ...customMetricShape }).strict(),
]);
export type GridMetric = z.infer<typeof gridMetricSchema>;

/**
 * La même colonne : même identifiant, même libellé, même mesure. Changer l'UNITÉ change ce que
 * l'athlète comprend — « 6 » en kilos et « 6 » en pourcentage du poids de corps ne sont pas le même
 * effort. Une colonne de l'ancienne grille s'y compare aussi, son repli (`collapsed`) ignoré.
 */
export function sameGridMetric(base: GridMetric, next: GridMetric): boolean {
  if (base.id !== next.id || base.label !== next.label) return false;
  // Changer de source, c'est changer de mesure : chaque branche exige la même des deux côtés.
  if (base.source === MetricSource.CATALOG) {
    return next.source === MetricSource.CATALOG && base.key === next.key && base.unit === next.unit;
  }
  return next.source === MetricSource.CUSTOM && base.customMetricId === next.customMetricId;
}

/** Mêmes colonnes, dans le même ordre : réordonner change ce que l'athlète lit. */
export function sameGridMetrics(base: readonly GridMetric[], next: readonly GridMetric[]): boolean {
  return (
    base.length === next.length &&
    base.every((metric, index) => {
      const counterpart = next[index];
      return counterpart != null && sameGridMetric(metric, counterpart);
    })
  );
}

/** Les valeurs sont indexées par l'`id` de la colonne : réordonner les colonnes ne les déplace pas. */
export const gridRowSchema = z
  .object({
    id: z.string().min(1),
    values: z.record(z.string(), metricValueSchema),
  })
  .strict();
export type GridRow = z.infer<typeof gridRowSchema>;

/**
 * Toutes les valeurs sont facultatives : une cellule vide se lit « — », et la séance s'enregistre
 * quand même. Une grille sans colonne est permise — une routine de mobilité n'a rien à mesurer.
 */
export const blockGridSchema = z
  .object({
    metrics: z.array(gridMetricSchema).max(GRID_MAX_METRICS),
    rows: z.array(gridRowSchema).max(GRID_MAX_ROWS),
  })
  .strict()
  .refine(...distinctColumnIds)
  .refine(...distinctRowIds)
  .superRefine((grid, context) => {
    // Chaque valeur orpheline est refusée À SA CELLULE, pour que l'éditeur la montre.
    const known = new Set(grid.metrics.map((metric) => metric.id));
    grid.rows.forEach((row, index) => {
      for (const metricId of Object.keys(row.values)) {
        if (known.has(metricId)) continue;
        context.addIssue({
          code: "custom",
          path: ["rows", index, "values", metricId],
          message: "Une ligne porte une valeur pour une colonne inexistante.",
        });
      }
    });
  });
export type BlockGrid = z.infer<typeof blockGridSchema>;

/**
 * Les colonnes d'un exercice qu'on ajoute à un bloc : ses métriques suggérées, dans l'ordre.
 * `newId(index)` fournit l'identifiant de chaque colonne.
 */
export function metricsFromSuggested(
  suggested: readonly SuggestedMetric[],
  newId: (index: number) => string,
): GridMetric[] {
  return suggested.map((metric, index) => ({ ...metric, id: newId(index), label: null }));
}
