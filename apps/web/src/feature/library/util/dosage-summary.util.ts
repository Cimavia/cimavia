import {
  type CustomMetric,
  type ExerciseBlock,
  type ExerciseBlocks,
  type MetricValue,
  metricCellText,
  restPhrase,
  structurePhrase,
} from "@cmv/shared";
import type { TFunction } from "i18next";

// i18n-values exercise.dosage: series, emom, amrap, amrapWithTarget, circuit, restBetweenSets, restBetweenRounds

/**
 * La phrase qu'une carte d'exercice affiche repliée — « 4 séries de 6 répétitions à +10 kg, 2'30
 * de repos entre les séries. »
 *
 * Elle sert à DEUX endroits qui doivent dire la même chose : la composition d'une séance et le
 * sélecteur de bibliothèque. Deux formulations différentes pour le même exercice feraient douter
 * le coach de ce qu'il ajoute.
 *
 * `null` quand il n'y a rien à résumer : un exercice sans bloc est légitime, et « aucun dosage »
 * serait du bruit sur une absence voulue.
 */
export function dosageSummary(
  blocks: ExerciseBlocks,
  customMetrics: readonly CustomMetric[],
  t: TFunction,
): string | null {
  const parts = blocks.map((block) => blockSummary(block, customMetrics, t)).filter(Boolean);
  return parts.length === 0 ? null : parts.join(" · ");
}

function blockSummary(
  block: ExerciseBlock,
  customMetrics: readonly CustomMetric[],
  t: TFunction,
): string {
  const structure = structurePhrase(block.structure);
  const rest = restPhrase(block.structure);

  const head = structure == null ? "" : t(structure.key, structure.params);
  const values = firstRowValues(block, customMetrics, t);
  const tail = rest == null ? "" : t(rest.key, rest.params);

  // Assemblé sans clé à trous : chaque morceau peut manquer, et une phrase pré-découpée aurait
  // exigé une variante par combinaison.
  return [head, values, tail].filter((part) => part !== "").join(", ");
}

/**
 * Les valeurs de la PREMIÈRE ligne, celle qui représente le mieux le dosage. Une carte repliée ne
 * peut pas montrer cinq lignes — le détail vit dans la grille dépliée.
 */
function firstRowValues(
  block: ExerciseBlock,
  customMetrics: readonly CustomMetric[],
  t: TFunction,
): string {
  const row = block.rows.at(0);
  if (row == null) return "";

  return (
    block.metrics
      // Les absences sont sautées ICI, explicitement : une carte repliée n'a pas la place
      // d'aligner des tirets. `metricCellText` rend TOUJOURS quelque chose — c'est à l'appelant de
      // déclarer ce qu'il omet, pas au formateur de rendre du vide en silence.
      .filter((metric) => (row.values[metric.id] ?? null) != null)
      .map((metric) => metricCellText(row.values[metric.id] ?? null, metric, customMetrics, t))
      .join(" · ")
  );
}

/** Le nombre de valeurs communes repliées d'un bloc — sert au décompte des cartes. */
export function collapsedCount(block: ExerciseBlock): number {
  return block.metrics.filter((metric) => metric.collapsed).length;
}

/** Ce qu'une colonne vaut aujourd'hui, pour l'indice « défaut … » posé sous une valeur ajustée. */
export function baselineValue(
  baseline: ExerciseBlocks,
  blockId: string,
  rowId: string,
  metricId: string,
): MetricValue {
  const block = baseline.find((current) => current.id === blockId);
  if (block == null) return null;
  const row = block.rows.find((current) => current.id === rowId);
  return row?.values[metricId] ?? null;
}

/** Les valeurs d'une colonne, pour le repli — réexporté ici pour garder un seul point d'entrée. */
export { columnValues } from "@cmv/shared";
