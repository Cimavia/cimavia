import {
  type CustomMetric,
  customMetricIdsIn,
  type MetricCitations,
  orderedScaleSchema,
} from "@cmv/shared";
import type { CustomMetric as CustomMetricRow } from "@prisma/client";

/** Le catalogue d'un Coach : ses métriques maison, triées par libellé. */
export type CustomMetricCatalog = readonly CustomMetricRow[];

/** Le catalogue de chaque propriétaire chargé — vide pour un Coach qui n'en a créé aucune. */
export type CatalogOf = (coachId: string) => CustomMetricCatalog;

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

/**
 * Les définitions que ces blocs, ces grilles ou ces métriques suggérées citent, prises dans le
 * catalogue de leur propriétaire (piège n°9). Une citation orpheline est ignorée : la métrique a
 * été supprimée depuis (dette EX-2).
 *
 * Passe par `toCustomMetricDto` et non par `customMetricSchema.parse` : le schéma est `.strict()`,
 * et une ligne Prisma porte `coachId`, `createdAt`, `updatedAt` qu'il refuse. Parser une ligne de
 * base comme si c'était un DTO faisait échouer toute la diffusion dès qu'un exercice citait une
 * métrique maison.
 */
export function citedCustomMetrics(
  blocks: MetricCitations,
  catalog: CustomMetricCatalog,
): CustomMetric[] {
  const wanted = new Set(customMetricIdsIn(blocks));
  return catalog.filter((metric) => wanted.has(metric.id)).map(toCustomMetricDto);
}

/**
 * Le catalogue que cite la grille d'un exercice de bloc (#716) : celui du propriétaire de
 * l'exercice, dont les métriques suggérées préremplissent les colonnes, et celui du propriétaire de
 * la séance, qui en ajoute. Une fois chacun, quand c'est le même Coach.
 */
export function gridCatalogOf(
  catalogOf: CatalogOf,
  exerciseOwnerId: string,
  sessionOwnerId: string,
): CustomMetricCatalog {
  return exerciseOwnerId === sessionOwnerId
    ? catalogOf(exerciseOwnerId)
    : [...catalogOf(exerciseOwnerId), ...catalogOf(sessionOwnerId)];
}
