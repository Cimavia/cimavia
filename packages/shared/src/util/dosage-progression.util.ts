import type { GridMetric } from "../dto/block-grid.schema";
import {
  type CustomMetric,
  type MetricValue,
  MetricValueType,
  type OrderedScale,
  scaleStepIndex,
} from "../dto/exercise-metric.schema";
import { metricValueTypeOf, scaleFor } from "../dto/metric-reference.schema";
import {
  STRUCTURE_MAX_DURATION_SECONDS,
  STRUCTURE_MAX_ROUNDS,
  STRUCTURE_MIN_DURATION_SECONDS,
  STRUCTURE_MIN_ROUNDS,
} from "../dto/structure.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { roundedLike } from "./decimal.util";
import { required } from "./invariant.util";
import {
  type DosageCell,
  DosageCellKind,
  type DosageColumn,
  DosageColumnKind,
} from "./planned-dosage.util";
import { sameJson } from "./same-json.util";
import { SettingValue } from "./structure-settings.util";
import { TRAINING_DURATION_MAX_SECONDS } from "./training-duration.util";

// « Progression… » dans Dosage (#724, maquette `coach_planification_blocs` frame 3 bis) : un pas
// appliqué d'une semaine d'entraînement à la suivante, sur une ligne. Le pas n'est pas enregistré :
// il ne sert qu'au moment de remplir. La valeur, elle, est typée par sa colonne — l'unité est celle
// de la colonne, si bien qu'un pas « dans une autre unité » ne peut pas se saisir.

// ── Ce que mesure la ligne ──────────────────────────────────────────────────────────────────

export const ProgressionMeasureKind = {
  NUMBER: "NUMBER",
  /** En secondes. */
  DURATION: "DURATION",
  /** En paliers d'une échelle ordonnée : de 5a à 5b. */
  SCALE: "SCALE",
} as const;
export type ProgressionMeasureKind = TypesValuesOf<typeof ProgressionMeasureKind>;

/** Ce qu'un pas ajoute, et entre quelles bornes : une valeur qui les passerait s'y arrête. */
export type ProgressionMeasure =
  | {
      kind: typeof ProgressionMeasureKind.NUMBER;
      integer: boolean;
      min: number | null;
      max: number | null;
    }
  | { kind: typeof ProgressionMeasureKind.DURATION; min: number; max: number }
  | { kind: typeof ProgressionMeasureKind.SCALE; scale: OrderedScale };

/** Une valeur du bloc : des tours se comptent, tout le reste est une durée de réglage. */
export function settingProgressionMeasure(field: SettingValue): ProgressionMeasure {
  if (field === SettingValue.ROUNDS) {
    return {
      kind: ProgressionMeasureKind.NUMBER,
      integer: true,
      min: STRUCTURE_MIN_ROUNDS,
      max: STRUCTURE_MAX_ROUNDS,
    };
  }
  return {
    kind: ProgressionMeasureKind.DURATION,
    min: STRUCTURE_MIN_DURATION_SECONDS,
    max: STRUCTURE_MAX_DURATION_SECONDS,
  };
}

/**
 * Une métrique d'exercice, ou `null` quand elle ne progresse pas : du texte, une échelle sans
 * paliers, ou une colonne maison dont la définition manque.
 */
export function metricProgressionMeasure(
  metric: GridMetric,
  customMetrics: readonly CustomMetric[],
): ProgressionMeasure | null {
  const valueType = metricValueTypeOf(metric, customMetrics);
  if (valueType === MetricValueType.NUMBER) {
    return { kind: ProgressionMeasureKind.NUMBER, integer: false, min: null, max: null };
  }
  if (valueType === MetricValueType.DURATION) {
    return { kind: ProgressionMeasureKind.DURATION, min: 0, max: TRAINING_DURATION_MAX_SECONDS };
  }
  const scale = valueType === MetricValueType.SCALE ? scaleFor(metric, customMetrics) : null;
  return scale === null ? null : { kind: ProgressionMeasureKind.SCALE, scale };
}

// ── Le pas ──────────────────────────────────────────────────────────────────────────────────

export const ProgressionDirection = { ADD: "ADD", REMOVE: "REMOVE" } as const;
export type ProgressionDirection = TypesValuesOf<typeof ProgressionDirection>;

/** `amount` est positif : c'est `direction` qui dit s'il s'ajoute ou se retire. */
export type ProgressionStep = { direction: ProgressionDirection; amount: number };

/**
 * Le pas tapé peut-il servir ? Nul, il ne ferait rien ; entier sur une échelle, des tours ou des
 * secondes — on avance d'un palier, pas d'un palier et demi.
 */
export function isUsableStep(step: ProgressionStep, measure: ProgressionMeasure): boolean {
  if (!Number.isFinite(step.amount) || step.amount <= 0) return false;
  const integer = measure.kind !== ProgressionMeasureKind.NUMBER || measure.integer;
  return !integer || Number.isInteger(step.amount);
}

const clamp = (value: number, min: number | null, max: number | null) =>
  Math.min(Math.max(value, min ?? -Infinity), max ?? Infinity);

/** Une valeur qu'un pas sait faire avancer : un nombre, ou un palier de l'échelle. */
function canStep(value: MetricValue, measure: ProgressionMeasure): boolean {
  if (measure.kind !== ProgressionMeasureKind.SCALE) return typeof value === "number";
  return typeof value === "string" && scaleStepIndex(measure.scale, value) !== null;
}

/** Une valeur plus le pas. Vide, elle reste vide ; d'un autre type que la colonne, elle ne bouge pas. */
export function steppedValue(
  value: MetricValue,
  measure: ProgressionMeasure,
  step: ProgressionStep,
): MetricValue {
  const signed = step.direction === ProgressionDirection.REMOVE ? -step.amount : step.amount;
  if (measure.kind === ProgressionMeasureKind.SCALE) {
    const from = typeof value === "string" ? scaleStepIndex(measure.scale, value) : null;
    if (from === null) return value;
    // Elle BUTE sur le premier ou le dernier palier : repasser à « 4a » après « 9c » n'aurait pas de sens.
    const position = clamp(from + signed, 0, measure.scale.length - 1);
    return required(measure.scale[position], "palier hors échelle");
  }
  if (typeof value !== "number") return value;
  return clamp(roundedLike(value + signed, value, signed), measure.min, measure.max);
}

// ── La ligne ────────────────────────────────────────────────────────────────────────────────

/** Une semaine de la ligne : sa colonne, et ce que la ligne y vaut. */
export type ProgressionSlot = { column: DosageColumn; cell: DosageCell };

/** Ce que vaut une semaine active ; `null` sautée — décharge, séance non posée ou hachures. */
const activeValues = ({ column, cell }: ProgressionSlot) =>
  column.deload || cell.kind !== DosageCellKind.VALUE ? null : cell.values;
const isLocked = (column: DosageColumn) => column.kind === DosageColumnKind.COPY && column.locked;

/**
 * La semaine d'où part la progression : la première active, débriefée comprise — elle se lit, et
 * dit ce qui a été fait. `null` quand il n'y a rien à faire avancer : pas de départ, un départ sans
 * valeur, ou plus aucune semaine à écrire après lui.
 */
export function progressionStart(
  slots: readonly ProgressionSlot[],
): { index: number; values: MetricValue[] } | null {
  const index = slots.findIndex((slot) => activeValues(slot) !== null);
  const values = index < 0 ? null : activeValues(required(slots[index], "départ trouvé"));
  if (values == null || values.every((value) => value == null)) return null;
  const writable = slots
    .slice(index + 1)
    .some((slot) => activeValues(slot) !== null && !isLocked(slot.column));
  return writable ? { index, values } : null;
}

export const ProgressionCellKind = {
  /** La semaine de départ : elle garde sa valeur. */
  START: "START",
  /** La semaine précédente plus le pas. */
  STEPPED: "STEPPED",
  /** Une décharge : sautée, elle garde sa valeur. */
  DELOAD: "DELOAD",
  /** Débriefée : elle garde sa valeur, et la semaine suivante repart d'elle. */
  DEBRIEFED: "DEBRIEFED",
  /** Séance non posée, ou rien à régler cette semaine. */
  SKIPPED: "SKIPPED",
} as const;
export type ProgressionCellKind = TypesValuesOf<typeof ProgressionCellKind>;

export type ProgressionCell =
  | { kind: typeof ProgressionCellKind.SKIPPED }
  | {
      kind: Exclude<ProgressionCellKind, typeof ProgressionCellKind.SKIPPED>;
      values: MetricValue[];
    };

export type DosageProgression = {
  start: { index: number; values: MetricValue[] };
  /** Une par semaine, dans l'ordre des colonnes. */
  cells: ProgressionCell[];
  /** Les rangs des semaines dont « Appliquer » remplacerait une valeur ajustée. */
  overwritten: number[];
};

/**
 * Ce que la ligne deviendrait : chaque semaine active reçoit la précédente plus le pas, série par
 * série — l'écart entre les séries reste le même. Une semaine qui a une série de plus la tire de la
 * dernière, comme un tour de plus reprend la dernière ligne. `null` sans départ (`progressionStart`)
 * ou sans pas utilisable.
 */
export function dosageProgression(
  slots: readonly ProgressionSlot[],
  measure: ProgressionMeasure,
  step: ProgressionStep,
): DosageProgression | null {
  const start = progressionStart(slots);
  if (start === null || !isUsableStep(step, measure)) return null;
  let previous = start.values;
  const overwritten: number[] = [];
  const cells = slots.map((slot, index): ProgressionCell => {
    if (slot.cell.kind !== DosageCellKind.VALUE) return { kind: ProgressionCellKind.SKIPPED };
    const values = slot.cell.values;
    if (slot.column.deload) return { kind: ProgressionCellKind.DELOAD, values };
    // Avant le départ, il n'y a que des semaines sautées : il est la première active.
    if (index === start.index) return { kind: ProgressionCellKind.START, values };
    if (isLocked(slot.column)) {
      previous = values;
      return { kind: ProgressionCellKind.DEBRIEFED, values };
    }
    const from = previous;
    const next = values.map((own, rank) => {
      const base = from[Math.min(rank, from.length - 1)] ?? null;
      // Rien d'où partir — une série vide la semaine d'avant : la semaine garde la sienne.
      return canStep(base, measure) ? steppedValue(base, measure, step) : own;
    });
    if (slot.cell.adjusted && !sameJson(next, values)) overwritten.push(index);
    previous = next;
    return { kind: ProgressionCellKind.STEPPED, values: next };
  });
  return { start, cells, overwritten };
}

/**
 * « Réinitialiser » une ligne : chaque semaine ajustée qu'on peut encore écrire revient aux valeurs
 * de SA séance-type reçue. Une semaine débriefée ne bouge pas ; un ajout ou un remplaçant non plus,
 * faute de référence.
 */
export function dosageRowReset(
  slots: readonly ProgressionSlot[],
): { index: number; values: MetricValue[] }[] {
  return slots.flatMap(({ column, cell }, index) =>
    cell.kind === DosageCellKind.VALUE &&
    cell.adjusted &&
    cell.reference !== null &&
    !isLocked(column)
      ? [{ index, values: cell.reference }]
      : [],
  );
}
