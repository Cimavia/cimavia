import {
  type BlockMetric,
  type ExerciseBlock,
  MetricSource,
  metricValueTypeOf,
  unitValues,
} from "../dto/exercise-block.schema";
import {
  type CustomMetric,
  METRIC_LABEL_KEY,
  METRIC_UNIT_LABEL_KEY,
  MetricUnit,
  type MetricValue,
  MetricValueType,
} from "../dto/exercise-metric.schema";
import { formatDecimal } from "./decimal.util";
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
 * La `locale` vient en dernier, comme pour tous les formateurs du paquet.
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

/**
 * `—` et jamais `0` : une valeur absente est une absence, pas un zéro (règle dure n°5).
 *
 * Un nombre s'écrit dans la langue du lecteur — « 12,5 kg » et non « 12.5 kg » (#298) : c'est ce
 * que le coach a tapé dans la grille, et l'athlète doit lire la même chose.
 */
export function formatMetricValue(
  value: MetricValue,
  metric: BlockMetric,
  customMetrics: readonly CustomMetric[],
  locale: string,
): string {
  if (value == null) return ABSENT;
  if (metricValueTypeOf(metric, customMetrics) === MetricValueType.DURATION) {
    return typeof value === "number" ? formatTrainingDuration(value) : String(value);
  }
  return typeof value === "number" ? formatDecimal(value, locale) : value;
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
  locale: string,
): string {
  const shown = formatMetricValue(value, metric, customMetrics, locale);
  const unit = value == null ? null : metricUnitLabel(metric, customMetrics, translate);
  return unit == null ? shown : `${shown} ${unit}`;
}

/**
 * Le dosage qu'une case de suivi rappelle — « 6a · 4 min », valeurs de SA ligne séparées d'un
 * point médian. Sans lui, l'athlète devrait remonter à la grille pour savoir ce qu'il coche.
 *
 * Chaîne vide quand la ligne n'a aucune valeur : il n'y a rien à rappeler, et la case s'affiche
 * sans détail plutôt qu'avec un tiret qui ferait croire à une colonne vide.
 */
export function unitDetail(
  block: ExerciseBlock,
  index: number,
  customMetrics: readonly CustomMetric[],
  translate: (key: string) => string,
  locale: string,
): string {
  return unitValues(block, index)
    .map(({ metric, value }) => metricCellText(value, metric, customMetrics, translate, locale))
    .join(" · ");
}
