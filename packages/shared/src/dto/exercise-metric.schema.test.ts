import { describe, expect, it } from "vitest";
import {
  customMetricSchema,
  defaultUnitOf,
  FRENCH_CLIMBING_SCALE,
  METRIC_CATALOG,
  METRIC_LABEL_KEY,
  MetricKey,
  MetricUnit,
  MetricValueType,
  metricAcceptsUnit,
  metricValueSchemaFor,
  orderedScaleSchema,
  scaleStepIndex,
  V_BOULDERING_SCALE,
} from "./exercise-metric.schema";

const metricKeys = Object.values(MetricKey);

describe("METRIC_CATALOG", () => {
  it("couvre toutes les clés et donne au moins une unité à chacune", () => {
    for (const key of metricKeys) {
      expect(METRIC_CATALOG[key].units.length).toBeGreaterThan(0);
      expect(METRIC_LABEL_KEY[key]).toMatch(/^exercise\.metric\./);
    }
  });

  it("ne propose d'unité qu'aux métriques qui en ont une à afficher", () => {
    // Une durée, un tempo ou une cotation n'ont pas d'unité : leur seule option est NONE.
    for (const key of metricKeys) {
      const { valueType, units } = METRIC_CATALOG[key];
      if (valueType === MetricValueType.DURATION || valueType === MetricValueType.SCALE) {
        expect(units).toEqual([MetricUnit.NONE]);
      }
    }
  });

  it("expose l'unité par défaut en première position", () => {
    expect(defaultUnitOf(MetricKey.LOAD)).toBe(MetricUnit.KILOGRAMS);
    expect(defaultUnitOf(MetricKey.REPETITIONS)).toBe(MetricUnit.REPS);
  });

  it("accepte les unités déclarées et rejette les autres", () => {
    expect(metricAcceptsUnit(MetricKey.LOAD, MetricUnit.KILOGRAMS_ADDED)).toBe(true);
    expect(metricAcceptsUnit(MetricKey.LOAD, MetricUnit.BPM)).toBe(false);
  });
});

describe("orderedScaleSchema", () => {
  it("accepte les deux cotations livrées", () => {
    expect(orderedScaleSchema.safeParse([...FRENCH_CLIMBING_SCALE]).success).toBe(true);
    expect(orderedScaleSchema.safeParse([...V_BOULDERING_SCALE]).success).toBe(true);
  });

  it("refuse un palier en double — la progression deviendrait ambiguë", () => {
    expect(orderedScaleSchema.safeParse(["5a", "5b", "5a"]).success).toBe(false);
  });

  it("refuse une échelle à un seul palier", () => {
    expect(orderedScaleSchema.safeParse(["5a"]).success).toBe(false);
  });

  it("conserve l'ordre — c'est lui qui porte la progression", () => {
    const scale = [...FRENCH_CLIMBING_SCALE];
    const from = scaleStepIndex(scale, "5a");
    const to = scaleStepIndex(scale, "6b");
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    expect(to as number).toBeGreaterThan(from as number);
  });

  it("rend null pour un palier hors de l'échelle", () => {
    expect(scaleStepIndex([...FRENCH_CLIMBING_SCALE], "V4")).toBeNull();
  });
});

describe("customMetricSchema", () => {
  const base = { id: "m_1", label: "Cotation maison", unit: null };

  it("accepte une métrique d'échelle avec ses paliers", () => {
    const result = customMetricSchema.safeParse({
      ...base,
      valueType: MetricValueType.SCALE,
      scale: ["1", "2", "3"],
    });
    expect(result.success).toBe(true);
  });

  it("refuse une métrique d'échelle sans paliers", () => {
    const result = customMetricSchema.safeParse({
      ...base,
      valueType: MetricValueType.SCALE,
      scale: null,
    });
    expect(result.success).toBe(false);
  });

  it("refuse des paliers sur une métrique qui n'est pas une échelle", () => {
    const result = customMetricSchema.safeParse({
      ...base,
      valueType: MetricValueType.NUMBER,
      scale: ["1", "2"],
    });
    expect(result.success).toBe(false);
  });

  it("refuse un champ inconnu (schéma strict)", () => {
    const result = customMetricSchema.safeParse({
      ...base,
      valueType: MetricValueType.NUMBER,
      scale: null,
      family: "VOLUME",
    });
    expect(result.success).toBe(false);
  });
});

describe("metricValueSchemaFor", () => {
  it("accepte null pour tout type — une cellule vide est légitime", () => {
    for (const valueType of Object.values(MetricValueType)) {
      expect(metricValueSchemaFor(valueType, ["a", "b"]).safeParse(null).success).toBe(true);
    }
  });

  it("refuse du texte dans une colonne numérique", () => {
    const schema = metricValueSchemaFor(MetricValueType.NUMBER);
    expect(schema.safeParse(12).success).toBe(true);
    expect(schema.safeParse("lourd").success).toBe(false);
  });

  it("exige des secondes entières et positives pour une durée", () => {
    const schema = metricValueSchemaFor(MetricValueType.DURATION);
    expect(schema.safeParse(150).success).toBe(true);
    expect(schema.safeParse(1.5).success).toBe(false);
    expect(schema.safeParse(-1).success).toBe(false);
  });

  it("n'accepte qu'un palier de l'échelle fournie", () => {
    const schema = metricValueSchemaFor(MetricValueType.SCALE, [...FRENCH_CLIMBING_SCALE]);
    expect(schema.safeParse("7a").success).toBe(true);
    expect(schema.safeParse("V4").success).toBe(false);
  });

  it("se limite à la forme quand l'échelle n'est pas connue", () => {
    const schema = metricValueSchemaFor(MetricValueType.SCALE);
    expect(schema.safeParse("7a").success).toBe(true);
    expect(schema.safeParse(7).success).toBe(false);
  });
});
