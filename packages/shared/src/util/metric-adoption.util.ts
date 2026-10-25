import type { BlockGrid } from "../dto/block-grid.schema";
import { type ExerciseBlocks, MetricSource } from "../dto/exercise-block.schema";
import {
  type CreateCustomMetricInput,
  CUSTOM_METRIC_LABEL_MAX_LENGTH,
  type CustomMetric,
} from "../dto/exercise-metric.schema";

/**
 * Ce que deviennent les métriques maison d'un exercice qui change de catalogue (#609) : la copie
 * figée que M garde de l'exercice de C, ou la variante que M en tire. `CustomMetric` est le
 * catalogue d'UN Coach : la copie ne peut pas citer celui de C, elle cite celui de M.
 *
 * `reused` : identifiant chez C → identifiant chez M, pour ce que M a déjà. `created` : ce qu'il
 * faut créer chez M, avec l'identifiant chez C que la création remplacera.
 */
export interface MetricAdoption {
  reused: ReadonlyMap<string, string>;
  created: readonly { sourceId: string; definition: CreateCustomMetricInput }[];
}

/**
 * Une métrique dont le libellé est libre chez le destinataire y est créée telle quelle. Si le
 * libellé existe déjà, elle est reprise quand sa nature est la même — type, unité et paliers ;
 * sinon elle est créée sous le libellé suivi du nom du propriétaire d'origine, « Cotation (C) »,
 * numéroté si ce libellé est pris à son tour par une autre nature, et coupé pour tenir dans la
 * longueur d'un libellé. Le libellé est la clé : `CustomMetric` est unique par `(coachId, label)`.
 */
export function adoptMetrics(
  cited: readonly CustomMetric[],
  catalog: readonly CustomMetric[],
  ownerName: string,
): MetricAdoption {
  const byLabel = new Map(catalog.map((metric) => [metric.label, metric]));
  // Les libellés que cette adoption crée : deux métriques coupées au même ne le prennent qu'une fois.
  const reserved = new Set<string>();
  const reused = new Map<string, string>();
  const created: { sourceId: string; definition: CreateCustomMetricInput }[] = [];
  for (const metric of cited) {
    const { id, ...definition } = metric;
    for (let rank = 0; ; rank += 1) {
      const label = labelAt(metric.label, ownerName, rank);
      if (reserved.has(label)) continue;
      const taken = byLabel.get(label);
      if (taken == null) {
        created.push({ sourceId: id, definition: { ...definition, label } });
        reserved.add(label);
        break;
      }
      if (sameNature(taken, metric)) {
        reused.set(id, taken.id);
        break;
      }
    }
  }
  return { reused, created };
}

/**
 * Rang 0 : le libellé lui-même ; 1 : « (C) » ; puis « (C 2) », « (C 3) »… Le libellé se coupe
 * d'abord, puis le nom, jamais le rang : deux rangs au-delà du premier ne rendent jamais le même
 * libellé, et la recherche d'un libellé libre finit toujours.
 */
function labelAt(label: string, ownerName: string, rank: number): string {
  if (rank === 0) return label;
  const number = rank === 1 ? "" : ` ${rank}`;
  // Un caractère du libellé, « ( », le rang et « ) » tiennent toujours ; le nom prend le reste.
  const nameRoom = CUSTOM_METRIC_LABEL_MAX_LENGTH - 1 - " ()".length - number.length;
  const tail = ` (${ownerName.slice(0, nameRoom).trimEnd()}${number})`;
  return `${label.slice(0, CUSTOM_METRIC_LABEL_MAX_LENGTH - tail.length).trimEnd()}${tail}`;
}

function sameNature(a: CustomMetric, b: CustomMetric): boolean {
  return (
    a.valueType === b.valueType &&
    a.unit === b.unit &&
    JSON.stringify(a.scale) === JSON.stringify(b.scale)
  );
}

/**
 * Les blocs — ou les grilles de blocs de séance (#716) —, citant le catalogue du destinataire. Une
 * citation absente de `ids` reste telle quelle : une métrique supprimée depuis ne se recopie pas
 * (#605), et la ligne la rend « — ».
 */
export function remapCustomMetrics<T extends ExerciseBlocks[number] | BlockGrid>(
  blocks: readonly T[],
  ids: ReadonlyMap<string, string>,
): T[] {
  return blocks.map((block) => ({
    ...block,
    metrics: block.metrics.map((metric) =>
      metric.source === MetricSource.CUSTOM
        ? { ...metric, customMetricId: ids.get(metric.customMetricId) ?? metric.customMetricId }
        : metric,
    ),
  }));
}
