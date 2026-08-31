import { type CustomMetric, orderedScaleSchema } from "@cmv/shared";
import type { CustomMetric as CustomMetricRow } from "@prisma/client";

/**
 * `scale` est une colonne JSON : Prisma la rend en `JsonValue`, sans contrat. Comme pour la
 * consigne et les blocs, on la repasse par Zod à la lecture et on laisse l'échec remonter —
 * une échelle illisible est un bug, pas un cas à absorber en silence.
 */
export function toCustomMetricDto(metric: CustomMetricRow): CustomMetric {
  return {
    id: metric.id,
    label: metric.label,
    unit: metric.unit,
    valueType: metric.valueType,
    scale: metric.scale === null ? null : orderedScaleSchema.parse(metric.scale),
  };
}
