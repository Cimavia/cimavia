import {
  type CustomMetric,
  customMetricIdsIn,
  type PlannedCompositionBlock,
  plannedLockIssues,
  type ScheduledSessionBlockDto,
  takenKeys,
} from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { citedCustomMetrics } from "../custom-metric/custom-metric.mapper";
import type { ComposedRow } from "./scheduled-session.writer";

/** Le verrou du niveau planifié, contre la référence stockée, et les clés de la séance-type. */
export function assertComposable(
  stored: readonly ScheduledSessionBlockDto[],
  blocks: readonly PlannedCompositionBlock<ComposedRow>[],
  sessionTypeKeys: readonly string[],
): void {
  const reference = stored.map((block) => ({
    name: block.name,
    settings: block.baseline.settings,
    exercises: block.baseline.exercises,
  }));
  const planned = blocks.map((block, index) => ({
    name: stored[index]?.name ?? "",
    settings: block.settings,
    exercises: block.exercises,
  }));
  if (plannedLockIssues(reference, planned).length > 0) {
    throw new BadRequestException("Structure verrouillée au niveau séance planifiée");
  }
  const referenceKeys = stored.flatMap((block) => block.baseline.exercises.map(({ key }) => key));
  if (takenKeys(blocks, [...referenceKeys, ...sessionTypeKeys]).length > 0) {
    throw new BadRequestException("Un exercice nouveau prend une clé de la séance-type");
  }
}

/**
 * Les définitions des métriques maison que cite la grille : celles que la séance a déjà figées
 * d'abord — un remplaçant garde une colonne de l'exercice qu'il remplace —, puis le catalogue du
 * propriétaire de l'exercice et de la séance. Une citation orpheline est ignorée (EX-2).
 */
export function definitionsOf(
  row: ComposedRow,
  frozen: readonly CustomMetric[],
  catalog: Parameters<typeof citedCustomMetrics>[1],
): CustomMetric[] {
  const wanted = new Set(customMetricIdsIn([row.grid]));
  const found = new Map<string, CustomMetric>();
  for (const metric of [...frozen, ...citedCustomMetrics([row.grid], catalog)]) {
    if (wanted.has(metric.id) && !found.has(metric.id)) found.set(metric.id, metric);
  }
  return [...found.values()];
}
