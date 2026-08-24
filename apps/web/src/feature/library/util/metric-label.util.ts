import {
  type BlockMetric,
  type CustomMetric,
  METRIC_LABEL_KEY,
  METRIC_UNIT_LABEL_KEY,
  MetricSource,
  MetricUnit,
} from "@cmv/shared";
import type { TFunction } from "i18next";

/**
 * Le libellé d'une colonne. Trois sources, dans cet ordre :
 *  1. le libellé que le coach a écrit sur CETTE colonne (« Voie » plutôt que « Libellé ») ;
 *  2. le nom de sa métrique maison, qui est SA donnée — donc jamais une clé i18n ;
 *  3. le catalogue livré, traduit.
 */
export function metricLabel(
  metric: BlockMetric,
  customMetrics: readonly CustomMetric[],
  t: TFunction,
): string {
  if (metric.label != null) return metric.label;
  if (metric.source === MetricSource.CUSTOM) {
    return customMetrics.find((custom) => custom.id === metric.customMetricId)?.label ?? "—";
  }
  return t(METRIC_LABEL_KEY[metric.key]);
}

/**
 * L'unité affichée à côté du libellé, ou `null` quand il n'y en a pas — `MetricUnit.NONE` n'est
 * pas une unité, c'est l'absence d'unité, et l'afficher mettrait un mot là où il n'y a rien.
 */
export function metricUnitLabel(
  metric: BlockMetric,
  customMetrics: readonly CustomMetric[],
  t: TFunction,
): string | null {
  if (metric.source === MetricSource.CUSTOM) {
    return customMetrics.find((custom) => custom.id === metric.customMetricId)?.unit ?? null;
  }
  return metric.unit === MetricUnit.NONE ? null : t(METRIC_UNIT_LABEL_KEY[metric.unit]);
}
