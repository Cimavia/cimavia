import {
  type BlockGrid,
  type CustomMetric,
  type DosageSessionInput,
  gridValueIssues,
  MetricSource,
  required,
  type ScheduledSessionBlockDto,
  sameJson,
  scheduledSessionBlocksSchema,
} from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { assertLocked } from "./scheduled-composition.rules";

/** Les définitions figées d'une ligne de la séance, par son identifiant. */
export type FrozenMetricsOf = (exerciseId: string) => readonly CustomMetric[];

/**
 * Les blocs d'une copie avec les valeurs que Dosage envoie (#721) : les réglages de chaque bloc et
 * la grille de chaque exercice, rien d'autre. Le reste vient de la copie STOCKÉE.
 *
 * - La composition ne se change pas ici (#720) : les blocs, leurs exercices, leur ordre et leurs
 *   colonnes doivent être ceux stockés, colonne pour colonne — les valeurs y sont indexées.
 * - Les blocs ainsi réglés passent par le schéma d'une séance planifiée (tours et lignes), le
 *   verrou contre la référence stockée (`plannedLockIssues`), et le type de chaque cellule contre
 *   les métriques maison que la ligne a figées.
 */
export function dosedBlocks(
  stored: readonly ScheduledSessionBlockDto[],
  sent: DosageSessionInput["blocks"],
  frozenOf: FrozenMetricsOf,
): ScheduledSessionBlockDto[] {
  if (!sameComposition(stored, sent)) {
    throw new BadRequestException("Dosage ne change pas la composition de la séance");
  }
  const blocks = stored.map((block, blockIndex) => {
    // Même composition juste au-dessus : chaque bloc et chaque exercice a son envoi au même rang.
    const values = required(sent[blockIndex], "[dosage] bloc non envoyé");
    return {
      ...block,
      settings: values.settings,
      exercises: block.exercises.map((exercise, index) => ({
        ...exercise,
        grid: required(values.exercises[index], "[dosage] exercice non envoyé").grid,
      })),
    };
  });

  // Tours, lignes et réglages grisés : ce que la séance planifiée refuse déjà d'elle-même.
  const [invalid] =
    scheduledSessionBlocksSchema.safeParse(blocks.map(toBlockInput)).error?.issues ?? [];
  if (invalid !== undefined) throw new BadRequestException(invalid.message);
  assertLocked(stored, blocks);
  for (const [blockIndex, block] of blocks.entries()) {
    for (const [index, exercise] of block.exercises.entries()) {
      // Même composition : la grille stockée est au même rang.
      const before = required(stored[blockIndex]?.exercises[index], "[dosage] exercice stocké");
      assertGridValues(exercise.grid, before.grid, frozenOf(exercise.id));
    }
  }
  return blocks;
}

/**
 * Chaque cellule contre le type de sa colonne. Une colonne maison dont la définition est perdue
 * (dette EX-2) ne se lit plus : elle garde ses valeurs — la refuser bloquerait toute la copie, et
 * la doser écrirait sans contrôle (`keepsLostValues`).
 */
function assertGridValues(
  grid: BlockGrid,
  before: BlockGrid,
  frozen: readonly CustomMetric[],
): void {
  const known = new Set(frozen.map((metric) => metric.id));
  const lost = grid.metrics.filter(
    (metric) => metric.source === MetricSource.CUSTOM && !known.has(metric.customMetricId),
  );
  if (lost.some((metric) => !keepsLostValues(grid, before, metric.id))) {
    throw new BadRequestException("Une métrique maison sans définition ne se dose pas");
  }
  const metrics = grid.metrics.filter((metric) => !lost.includes(metric));
  const [issue] = gridValueIssues({ ...grid, metrics }, frozen);
  if (issue !== undefined) throw new BadRequestException(issue.message);
}

/**
 * Aucune valeur neuve dans la colonne : une ligne gardée garde la sienne, une ligne ajoutée ne
 * reprend qu'une valeur que la colonne avait déjà — c'est ce que fait une série recopiée. Une ligne
 * retirée emporte la sienne : baisser les tours reste permis.
 */
function keepsLostValues(grid: BlockGrid, before: BlockGrid, metricId: string): boolean {
  const stored = new Map(before.rows.map((row) => [row.id, row.values[metricId] ?? null]));
  const held = [...stored.values()];
  return grid.rows.every((row) => {
    const value = row.values[metricId] ?? null;
    if (stored.has(row.id)) return sameJson(value, stored.get(row.id));
    return value === null || held.some((each) => sameJson(each, value));
  });
}

function sameComposition(
  stored: readonly ScheduledSessionBlockDto[],
  sent: DosageSessionInput["blocks"],
): boolean {
  return (
    sent.length === stored.length &&
    stored.every((block, blockIndex) => {
      const values = sent[blockIndex];
      return (
        values?.id === block.id &&
        values.exercises.length === block.exercises.length &&
        block.exercises.every((exercise, index) => {
          const grid = values.exercises[index];
          return grid?.key === exercise.key && sameJson(grid.grid.metrics, exercise.grid.metrics);
        })
      );
    })
  );
}

/**
 * Le bloc sous la forme que valide le schéma d'une séance planifiée. Il exige la source d'un
 * exercice, qu'un bloc planifié ne rend pas et que rien ne lit ici : la ligne en tient lieu.
 */
function toBlockInput({ baseline, tracking, exercises, ...block }: ScheduledSessionBlockDto) {
  return {
    ...block,
    exercises: exercises.map(({ id, ...exercise }) => ({ ...exercise, exerciseId: id })),
  };
}
