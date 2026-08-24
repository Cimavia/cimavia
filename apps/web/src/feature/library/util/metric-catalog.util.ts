import {
  METRIC_CATALOG,
  METRIC_UNIT_LABEL_KEY,
  type MetricFamily,
  type MetricKey,
  MetricUnit,
} from "@cmv/shared";
import type { TFunction } from "i18next";

/**
 * Les métriques du catalogue, groupées par famille et dans l'ordre du catalogue — qui est celui de
 * la maquette : Volume, Intensité, Récupération, Exécution, Repères.
 */
export function catalogByFamily(): Map<MetricFamily, MetricKey[]> {
  const grouped = new Map<MetricFamily, MetricKey[]>();
  for (const [key, definition] of Object.entries(METRIC_CATALOG)) {
    const family = definition.family;
    const bucket = grouped.get(family) ?? [];
    bucket.push(key as MetricKey);
    grouped.set(family, bucket);
  }
  return grouped;
}

/**
 * L'indice sous le nom d'une métrique — « kg · +kg de lest · % du poids de corps ».
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
