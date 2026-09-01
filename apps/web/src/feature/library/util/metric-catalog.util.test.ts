import { METRIC_CATALOG, type MetricKey, MetricUnit } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { fakeT } from "../../../../test/translator";
import { catalogByFamily, metricHint } from "./metric-catalog.util";

describe("catalogByFamily", () => {
  it("n'égare aucune métrique du catalogue", () => {
    const grouped = [...catalogByFamily().values()].flat();
    expect(grouped.toSorted()).toEqual(Object.keys(METRIC_CATALOG).toSorted());
  });

  it("garde l'ordre du catalogue dans chaque famille, qui est celui de la maquette", () => {
    const order = Object.keys(METRIC_CATALOG) as MetricKey[];
    for (const keys of catalogByFamily().values()) {
      const positions = keys.map((key) => order.indexOf(key));
      expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    }
  });
});

describe("metricHint", () => {
  /**
   * L'indice est DÉRIVÉ des unités admises. Le vérifier sur tout le catalogue plutôt que sur un
   * exemple : c'est la dérivation qu'on protège, pas une métrique en particulier.
   */
  it.each(
    Object.keys(METRIC_CATALOG) as MetricKey[],
  )("dit exactement les unités admises de %s, ou rien", (key) => {
    const units = METRIC_CATALOG[key].units.filter((unit) => unit !== MetricUnit.NONE);
    const hint = metricHint(key, fakeT);
    if (units.length === 0) expect(hint).toBeNull();
    else expect(hint?.split(" · ")).toHaveLength(units.length);
  });

  it("rend null et non une chaîne vide quand la métrique n'a aucune unité", () => {
    const withoutUnit = (Object.keys(METRIC_CATALOG) as MetricKey[]).find(
      (key) => METRIC_CATALOG[key].units.filter((unit) => unit !== MetricUnit.NONE).length === 0,
    );
    expect(withoutUnit).toBeDefined();
    if (withoutUnit != null) expect(metricHint(withoutUnit, fakeT)).toBeNull();
  });
});
