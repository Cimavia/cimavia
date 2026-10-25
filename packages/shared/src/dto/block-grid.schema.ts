import { z } from "zod";
import { MetricSource } from "./exercise-block.schema";
import {
  metricAcceptsUnit,
  metricKeySchema,
  metricUnitSchema,
  metricValueSchema,
} from "./exercise-metric.schema";
import { STRUCTURE_MAX_ROUNDS } from "./structure.schema";

// La grille d'un exercice de bloc (#715) : ses colonnes et ses lignes de valeurs.
//
// Reprend la grille de `exercise-block.schema` sans le repli de colonne (`collapsed`), que le
// modèle par blocs n'a plus. L'ancienne grille tombe avec #723.

export const GRID_MAX_METRICS = 12;
export const GRID_LABEL_MAX_LENGTH = 60;
/** Une ligne par tour, série ou passage : autant que de tours au plus. */
export const GRID_MAX_ROWS = STRUCTURE_MAX_ROUNDS;

const catalogMetric = {
  source: z.literal(MetricSource.CATALOG),
  key: metricKeySchema,
  unit: metricUnitSchema,
};
const customMetric = {
  source: z.literal(MetricSource.CUSTOM),
  customMetricId: z.string().min(1),
};
const acceptedUnit: [
  (metric: {
    key: z.infer<typeof metricKeySchema>;
    unit: z.infer<typeof metricUnitSchema>;
  }) => boolean,
  { message: string; path: string[] },
] = [
  (metric) => metricAcceptsUnit(metric.key, metric.unit),
  { message: "Cette unité n'est pas admise par la métrique.", path: ["unit"] },
];

// ── Les métriques suggérées d'un exercice ───────────────────────────────────────────────────

/**
 * Une métrique que l'exercice SUGGÈRE, sans valeur : elle préremplit une colonne quand on ajoute
 * l'exercice à un bloc. L'exercice ne porte plus de dosage (#718).
 */
export const suggestedMetricSchema = z.discriminatedUnion("source", [
  z
    .object(catalogMetric)
    .strict()
    .refine(...acceptedUnit),
  z.object(customMetric).strict(),
]);
export type SuggestedMetric = z.infer<typeof suggestedMetricSchema>;

/** Ce qui fait d'une métrique la même colonne : sa clé du catalogue, ou la métrique du Coach. */
function metricIdentity(metric: SuggestedMetric): string {
  return metric.source === MetricSource.CATALOG
    ? `${metric.source}:${metric.key}`
    : `${metric.source}:${metric.customMetricId}`;
}

export const suggestedMetricsSchema = z
  .array(suggestedMetricSchema)
  .max(GRID_MAX_METRICS)
  .refine((metrics) => new Set(metrics.map(metricIdentity)).size === metrics.length, {
    message: "Un exercice ne peut pas suggérer deux fois la même métrique.",
  });

// ── La grille ───────────────────────────────────────────────────────────────────────────────

/** `label` remplace l'en-tête par défaut quand le Coach le renseigne (« Voie » plutôt que « Libellé »). */
const gridMetricBase = {
  id: z.string().min(1),
  label: z.string().min(1).max(GRID_LABEL_MAX_LENGTH).nullable(),
};

export const gridMetricSchema = z.discriminatedUnion("source", [
  z
    .object({ ...gridMetricBase, ...catalogMetric })
    .strict()
    .refine(...acceptedUnit),
  z.object({ ...gridMetricBase, ...customMetric }).strict(),
]);
export type GridMetric = z.infer<typeof gridMetricSchema>;

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
  .refine((grid) => new Set(grid.metrics.map((m) => m.id)).size === grid.metrics.length, {
    message: "Deux colonnes ne peuvent pas partager le même identifiant.",
    path: ["metrics"],
  })
  .refine((grid) => new Set(grid.rows.map((r) => r.id)).size === grid.rows.length, {
    message: "Deux lignes ne peuvent pas partager le même identifiant.",
    path: ["rows"],
  })
  .refine(
    (grid) => {
      const known = new Set(grid.metrics.map((metric) => metric.id));
      return grid.rows.every((row) => Object.keys(row.values).every((id) => known.has(id)));
    },
    { message: "Une ligne porte une valeur pour une colonne inexistante.", path: ["rows"] },
  );
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
