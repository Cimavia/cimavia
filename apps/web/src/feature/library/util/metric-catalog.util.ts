import {
  type CustomMetric,
  METRIC_CATALOG,
  METRIC_UNIT_LABEL_KEY,
  MetricFamily,
  type MetricKey,
  MetricUnit,
} from "@cmv/shared";
import type { TFunction } from "i18next";

/**
 * Les métriques du catalogue, groupées par famille.
 *
 * Les familles viennent dans l'ordre où `MetricFamily` les déclare, et chacune garde l'ordre du
 * catalogue. Les déduire de la première métrique rencontrée ferait dépendre la place d'une famille
 * de celle d'une métrique dans le catalogue : en déplacer une suffirait à réordonner le sélecteur.
 */
export function catalogByFamily(): Map<MetricFamily, MetricKey[]> {
  const keys = Object.keys(METRIC_CATALOG) as MetricKey[];
  return new Map(
    Object.values(MetricFamily).map((family) => [
      family,
      keys.filter((key) => METRIC_CATALOG[key].family === family),
    ]),
  );
}

/**
 * L'indice sous le nom d'une métrique — « kg · kg de lest · % du poids de corps ».
 *
 * DÉRIVÉ des unités admises plutôt que rédigé à la main : une table d'indices en doublerait une
 * qui existe déjà, et les deux finiraient par diverger. Une métrique sans unité n'a donc pas
 * d'indice, ce qui est juste — il n'y aurait rien à dire.
 */
export function metricHint(key: MetricKey, t: TFunction): string | null {
  const units = METRIC_CATALOG[key].units.filter((unit) => unit !== MetricUnit.NONE);
  if (units.length === 0) return null;
  return units.map((unit) => t(METRIC_UNIT_LABEL_KEY[unit])).join(" · ");
}

/**
 * Les définitions où se résolvent des colonnes, réunies par identifiant : le catalogue VIVANT du
 * Coach d'abord, puis celles qu'un exercice ou une ligne de séance embarque (#605). L'exercice
 * d'un autre Coach cite son catalogue, que le lecteur n'a pas : sans les définitions embarquées,
 * sa cotation se lirait comme une colonne inconnue. La première qui connaît un id l'emporte.
 */
export function mergeCatalogs(
  ...catalogs: readonly (readonly CustomMetric[] | undefined)[]
): CustomMetric[] {
  const byId = new Map<string, CustomMetric>();
  for (const metric of catalogs.flatMap((catalog) => catalog ?? [])) {
    if (!byId.has(metric.id)) byId.set(metric.id, metric);
  }
  return [...byId.values()];
}
