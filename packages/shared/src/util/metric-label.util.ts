import { type BlockMetric, MetricSource, metricValueTypeOf } from "../dto/exercise-block.schema";
import {
  type CustomMetric,
  METRIC_LABEL_KEY,
  METRIC_UNIT_LABEL_KEY,
  MetricUnit,
  type MetricValue,
  MetricValueType,
} from "../dto/exercise-metric.schema";
import { formatTrainingDuration } from "./training-duration.util";

/**
 * Comment une colonne de dosage se dit, et comment sa valeur s'écrit.
 *
 * Les deux surfaces montrent la MÊME donnée : un coach qui doute de ce que son athlète voit n'a
 * plus de raison de douter. C'est ce que §7 appelle une formule — recomposée ailleurs, c'est un
 * bug, et ç'en avait produit un (le mobile rendait `""` là où le web rendait `—`, cf. #137).
 *
 * `translate` est INJECTÉ et typé structurellement : `@cmv/shared` ne connaît pas i18next, et
 * chaque app a son instance. Même dispositif que `notificationSubject` et `formatRelativeOrDateTime`.
 */

/** L'absence, écrite. Un seul caractère, mais c'est le contrat de tout ce module. */
const ABSENT = "—";

/**
 * Le libellé d'une colonne. Trois sources, dans cet ordre :
 *  1. le libellé que le coach a écrit sur CETTE colonne (« Voie » plutôt que « Libellé ») ;
 *  2. le nom de sa métrique maison, qui est SA donnée — donc jamais une clé i18n ;
 *  3. le catalogue livré, traduit.
 */
export function metricLabel(
  metric: BlockMetric,
  customMetrics: readonly CustomMetric[],
  translate: (key: string) => string,
): string {
  if (metric.label != null) return metric.label;
  if (metric.source === MetricSource.CUSTOM) {
    return customMetrics.find((custom) => custom.id === metric.customMetricId)?.label ?? ABSENT;
  }
  return translate(METRIC_LABEL_KEY[metric.key]);
}

/**
 * L'unité affichée à côté du libellé, ou `null` quand il n'y en a pas — `MetricUnit.NONE` n'est
 * pas une unité, c'est l'absence d'unité, et l'afficher mettrait un mot là où il n'y a rien.
 */
export function metricUnitLabel(
  metric: BlockMetric,
  customMetrics: readonly CustomMetric[],
  translate: (key: string) => string,
): string | null {
  if (metric.source === MetricSource.CUSTOM) {
    return customMetrics.find((custom) => custom.id === metric.customMetricId)?.unit ?? null;
  }
  return metric.unit === MetricUnit.NONE ? null : translate(METRIC_UNIT_LABEL_KEY[metric.unit]);
}

/** `—` et jamais `0` : une valeur absente est une absence, pas un zéro (règle dure n°5). */
export function formatMetricValue(
  value: MetricValue,
  metric: BlockMetric,
  customMetrics: readonly CustomMetric[],
): string {
  if (value == null) return ABSENT;
  if (metricValueTypeOf(metric, customMetrics) === MetricValueType.DURATION) {
    return typeof value === "number" ? (formatTrainingDuration(value) ?? ABSENT) : String(value);
  }
  return String(value);
}

/**
 * « 6 répétitions » — la valeur suivie de son unité, pour les formes qui n'ont pas d'en-tête de
 * colonne pour la porter : phrase de dosage, cartes, cases à cocher du suivi.
 *
 * Pas d'unité derrière une absence : « — kg » laisse croire à une charge nulle, alors que « — »
 * dit exactement ce qu'il y a — rien.
 *
 * Rend TOUJOURS quelque chose, jamais `""` : une chaîne vide serait un fallback silencieux, qui
 * confond « pas de valeur » et « rien à dire » et disparaît sans bruit d'un `join(" · ")`. Les
 * appelants qui veulent vraiment omettre une absence — la bannière d'un segment en cours, une
 * carte repliée — la filtrent EXPLICITEMENT en amont, là où l'on voit qu'ils le font.
 */
export function metricCellText(
  value: MetricValue,
  metric: BlockMetric,
  customMetrics: readonly CustomMetric[],
  translate: (key: string) => string,
): string {
  const shown = formatMetricValue(value, metric, customMetrics);
  const unit = value == null ? null : metricUnitLabel(metric, customMetrics, translate);
  return unit == null ? shown : `${shown} ${unit}`;
}
