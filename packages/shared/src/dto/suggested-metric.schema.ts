import { z } from "zod";
import {
  catalogMetricShape,
  customMetricShape,
  GRID_MAX_METRICS,
  MetricSource,
  metricUnitRefinement,
} from "./metric-reference.schema";

// Les métriques suggérées d'un exercice (#715, #718).
//
// Un module à part, et non dans `block-grid.schema` : l'exercice les porte, et la grille lit les
// bornes de la structure, qui lit les tags de l'exercice. Réunies, ces dépendances formeraient un
// cycle d'imports.

/**
 * Une métrique que l'exercice SUGGÈRE, sans valeur : elle préremplit une colonne quand on ajoute
 * l'exercice à un bloc. L'exercice ne porte plus de dosage (#718).
 */
export const suggestedMetricSchema = z.discriminatedUnion("source", [
  z
    .object(catalogMetricShape)
    .strict()
    .refine(...metricUnitRefinement),
  z.object(customMetricShape).strict(),
]);
export type SuggestedMetric = z.infer<typeof suggestedMetricSchema>;

/** Ce qui fait d'une métrique la même colonne : sa clé du catalogue, ou la métrique du Coach. */
export function suggestedMetricIdentity(metric: SuggestedMetric): string {
  return metric.source === MetricSource.CATALOG
    ? `${metric.source}:${metric.key}`
    : `${metric.source}:${metric.customMetricId}`;
}

/** Autant qu'une grille a de colonnes : chaque métrique suggérée en préremplit une. */
export const suggestedMetricsSchema = z
  .array(suggestedMetricSchema)
  .max(GRID_MAX_METRICS)
  .refine((metrics) => new Set(metrics.map(suggestedMetricIdentity)).size === metrics.length, {
    message: "Un exercice ne peut pas suggérer deux fois la même métrique.",
  });
