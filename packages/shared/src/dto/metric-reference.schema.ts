import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import {
  type CustomMetric,
  catalogScaleOf,
  METRIC_CATALOG,
  type MetricKey,
  type MetricUnit,
  type MetricValueType,
  metricAcceptsUnit,
  metricKeySchema,
  metricUnitSchema,
  type OrderedScale,
} from "./exercise-metric.schema";

// Ce qui DÉSIGNE une métrique — une clé du catalogue et son unité, ou une métrique du Coach —,
// commun aux colonnes d'une grille (`block-grid.schema`) et aux métriques suggérées d'un exercice
// (`suggested-metric.schema`). Un module à part : la grille lit les bornes de la structure, qui lit
// les tags de l'exercice, qui porte ses métriques suggérées ; réunies, ces dépendances formeraient
// un cycle d'imports.

/** Autant de colonnes qu'une grille en porte, autant de métriques qu'un exercice en suggère. */
export const GRID_MAX_METRICS = 12;

export const MetricSource = {
  CATALOG: "CATALOG",
  CUSTOM: "CUSTOM",
} as const;
export type MetricSource = TypesValuesOf<typeof MetricSource>;

export const catalogMetricShape = {
  source: z.literal(MetricSource.CATALOG),
  key: metricKeySchema,
  unit: metricUnitSchema,
};
export const customMetricShape = {
  source: z.literal(MetricSource.CUSTOM),
  customMetricId: z.string().min(1),
};
export const metricUnitRefinement: [
  (metric: { key: MetricKey; unit: MetricUnit }) => boolean,
  { message: string; path: string[] },
] = [
  (metric) => metricAcceptsUnit(metric.key, metric.unit),
  { message: "Cette unité n'est pas admise par la métrique.", path: ["unit"] },
];

/** Ce qui désigne la métrique d'une colonne ou d'une suggestion, sans son unité. */
export type MetricReference =
  | { readonly source: typeof MetricSource.CATALOG; readonly key: MetricKey }
  | { readonly source: typeof MetricSource.CUSTOM; readonly customMetricId: string };

/**
 * Ce qui cite des métriques : des grilles de blocs de séance (#716), ou les métriques suggérées
 * d'un exercice, sous la forme `[{ metrics }]` (#718).
 */
export type MetricCitations = readonly { readonly metrics: readonly MetricReference[] }[];

/**
 * Les métriques MAISON citées par des grilles ou des métriques suggérées. Sert au snapshot de
 * diffusion : sans la définition, l'athlète ne verrait qu'un identifiant — ni libellé, ni type de
 * valeur, ni paliers d'échelle.
 */
export function customMetricIdsIn(citations: MetricCitations): string[] {
  const ids = citations.flatMap((citation) =>
    citation.metrics.flatMap((metric) =>
      metric.source === MetricSource.CUSTOM ? [metric.customMetricId] : [],
    ),
  );
  return [...new Set(ids)];
}

/** Le type de valeur d'une colonne — catalogue ou métrique du coach. */
export function metricValueTypeOf(
  metric: MetricReference,
  customMetrics: readonly CustomMetric[] = [],
): MetricValueType | null {
  if (metric.source === MetricSource.CATALOG) return METRIC_CATALOG[metric.key].valueType;
  return customMetrics.find((c) => c.id === metric.customMetricId)?.valueType ?? null;
}

/**
 * L'échelle d'une colonne, MAISON ou livrée avec le catalogue — ou `null` si elle n'en a pas.
 *
 * Un seul point de résolution : la grille, le menu de colonne et la validation la cherchaient
 * chacun de leur côté, et tous les trois ne regardaient que les métriques maison. Une échelle
 * livrée n'aurait été vue nulle part.
 */
export function scaleFor(
  metric: MetricReference,
  customMetrics: readonly CustomMetric[],
): OrderedScale | null {
  if (metric.source === MetricSource.CUSTOM) {
    return customMetrics.find((custom) => custom.id === metric.customMetricId)?.scale ?? null;
  }
  return catalogScaleOf(metric.key);
}
