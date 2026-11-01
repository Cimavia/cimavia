import { GRID_MAX_ROWS, type GridRow } from "../dto/block-grid.schema";
import { type MetricValue, type OrderedScale, scaleStepIndex } from "../dto/exercise-metric.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { decimalPlaces } from "./decimal.util";
import { required } from "./invariant.util";

// ── Remplissage d'une colonne ───────────────────────────────────────────────────────────────

/**
 * Les quatre façons de remplir une colonne d'un coup. Elles existent parce que la saisie
 * cellule par cellule est le vrai coût du dosage : « 6 · 6 · 6 · 6 », « 8 · 10 · 12 · 14 » et
 * « 5a · 5b · 6a · 6b » sont trois gestes que le coach refait à chaque exercice.
 */
export const ColumnFillMode = {
  SAME: "SAME",
  STEP: "STEP",
  SCALE_STEP: "SCALE_STEP",
  MIRROR: "MIRROR",
} as const;
export type ColumnFillMode = TypesValuesOf<typeof ColumnFillMode>;

export type ColumnFillPlan =
  | { mode: typeof ColumnFillMode.SAME; value: MetricValue }
  | { mode: typeof ColumnFillMode.STEP; start: number; step: number }
  | { mode: typeof ColumnFillMode.SCALE_STEP; scale: OrderedScale; start: string; step: number }
  | { mode: typeof ColumnFillMode.MIRROR };

function fillSame(count: number, value: MetricValue): MetricValue[] {
  return Array.from({ length: count }, () => value);
}

/**
 * Arrondie au nombre de décimales du départ ou du pas, le plus grand des deux : en virgule
 * flottante, 0 + 3 × 0,1 vaut 0,30000000000000004, et c'est ce que la cellule afficherait. Une
 * progression ne peut pas avoir plus de décimales que ce que le coach a tapé.
 */
function fillStep(count: number, start: number, step: number): MetricValue[] {
  const startPlaces = decimalPlaces(start);
  const stepPlaces = decimalPlaces(step);
  const places =
    startPlaces == null || stepPlaces == null ? null : Math.max(startPlaces, stepPlaces);
  return Array.from({ length: count }, (_, index) => {
    const value = start + index * step;
    return places == null ? value : Number(value.toFixed(places));
  });
}

/**
 * Progression sur une échelle ORDONNÉE. Elle BUTE sur le dernier palier au lieu de boucler :
 * repasser à « 5a » après « 9c » produirait une consigne absurde que rien ne signalerait.
 */
function fillScaleStep(
  count: number,
  scale: OrderedScale,
  start: string,
  step: number,
): MetricValue[] {
  const from = scaleStepIndex(scale, start);
  if (from == null) return fillSame(count, null);
  return Array.from({ length: count }, (_, index) => {
    // Bornée à l'échelle, qui n'est pas vide : `from` y a été trouvé.
    const position = Math.min(Math.max(from + index * step, 0), scale.length - 1);
    return required(scale[position], "palier hors échelle");
  });
}

/**
 * Miroir : la première moitié saisie, la seconde qui la reflète. Sur un nombre IMPAIR de lignes,
 * le palier du milieu n'est pas dupliqué — c'est le sommet de la pyramide.
 */
function fillMirror(values: readonly MetricValue[]): MetricValue[] {
  const half = Math.ceil(values.length / 2);
  return [...values.slice(0, half), ...values.slice(0, values.length - half).reverse()];
}

function plannedValues(current: readonly MetricValue[], plan: ColumnFillPlan): MetricValue[] {
  const count = current.length;
  if (plan.mode === ColumnFillMode.SAME) return fillSame(count, plan.value);
  if (plan.mode === ColumnFillMode.STEP) return fillStep(count, plan.start, plan.step);
  if (plan.mode === ColumnFillMode.SCALE_STEP) {
    return fillScaleStep(count, plan.scale, plan.start, plan.step);
  }
  return fillMirror(current);
}

/**
 * Les lignes, une colonne réécrite. Les AUTRES colonnes ne bougent pas : remplir « Charge » ne doit
 * rien faire aux répétitions déjà saisies.
 */
export function fillRows(
  rows: readonly GridRow[],
  metricId: string,
  plan: ColumnFillPlan,
): GridRow[] {
  const next = plannedValues(
    rows.map((row) => row.values[metricId] ?? null),
    plan,
  );
  return rows.map((row, index) => ({
    ...row,
    values: { ...row.values, [metricId]: next[index] ?? null },
  }));
}

/** Les lignes, UNE cellule réécrite — les autres lignes et les autres colonnes ne bougent pas. */
export function withCellValue(
  rows: readonly GridRow[],
  rowId: string,
  metricId: string,
  value: MetricValue,
): GridRow[] {
  return rows.map((row) =>
    row.id === rowId ? { ...row, values: { ...row.values, [metricId]: value } } : row,
  );
}

/**
 * Les lignes, prolongées jusqu'à la ligne `index` incluse : chaque ligne créée recopie la dernière,
 * c'est-à-dire ce que le tour jouait déjà en fantôme. Matérialiser ne change donc rien à ce que
 * l'athlète fera — seule la valeur que le coach tape ensuite le change.
 *
 * `newId(index)` fournit l'identifiant de la ligne créée à ce rang : la grille réserve ceux de ses
 * fantômes, pour qu'une ligne qui se matérialise garde sa place — et le focus — à l'écran.
 * Plafonné à `GRID_MAX_ROWS`, comme tout ajout de ligne.
 */
export function withMaterializedSeries(
  rows: GridRow[],
  index: number,
  newId: (index: number) => string,
): GridRow[] {
  const length = Math.min(index + 1, GRID_MAX_ROWS);
  if (rows.length >= length) return rows;
  const values = rows.at(-1)?.values;
  const created = Array.from({ length: length - rows.length }, (_unused, offset) => ({
    id: newId(rows.length + offset),
    values: { ...values },
  }));
  return [...rows, ...created];
}
