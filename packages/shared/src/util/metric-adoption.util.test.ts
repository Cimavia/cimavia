import { describe, expect, it } from "vitest";
import { custom, gridOf, reps } from "../../test/block-fixtures";
import { type ExerciseBlocks, MetricSource } from "../dto/exercise-block.schema";
import {
  CUSTOM_METRIC_LABEL_MAX_LENGTH,
  type CustomMetric,
  MetricValueType,
} from "../dto/exercise-metric.schema";
import { adoptMetrics, remapCustomMetrics } from "./metric-adoption.util";

function metric(id: string, label: string, over: Partial<CustomMetric> = {}): CustomMetric {
  return { id, label, unit: null, valueType: MetricValueType.NUMBER, scale: null, ...over };
}

const SCALE: Partial<CustomMetric> = { valueType: MetricValueType.SCALE, scale: ["a", "b"] };

describe("adoptMetrics", () => {
  it("crée telle quelle une métrique dont le libellé est libre chez le destinataire", () => {
    const adoption = adoptMetrics([metric("c1", "Cotation", { unit: "pts" })], [], "C");
    expect(adoption.reused.size).toBe(0);
    expect(adoption.created).toEqual([
      {
        sourceId: "c1",
        definition: { label: "Cotation", unit: "pts", valueType: "NUMBER", scale: null },
      },
    ]);
  });

  it("reprend l'homonyme de même nature", () => {
    const adoption = adoptMetrics(
      [metric("c1", "Cotation", SCALE)],
      [metric("m1", "Cotation", SCALE)],
      "C",
    );
    expect([...adoption.reused]).toEqual([["c1", "m1"]]);
    expect(adoption.created).toEqual([]);
  });

  it.each<[string, Partial<CustomMetric>]>([
    ["le type", { valueType: MetricValueType.TEXT }],
    ["l'unité", { unit: "kg" }],
    ["les paliers", { valueType: MetricValueType.SCALE, scale: ["b", "a"] }],
  ])("suffixe le nom du propriétaire quand %s diffère", (_, over) => {
    const adoption = adoptMetrics(
      [metric("c1", "Cotation", SCALE)],
      [metric("m1", "Cotation", { ...SCALE, ...over })],
      "Camille",
    );
    expect(adoption.reused.size).toBe(0);
    expect(adoption.created.map((c) => c.definition.label)).toEqual(["Cotation (Camille)"]);
  });

  it("reprend le libellé suffixé qu'une copie précédente a créé, de même nature", () => {
    const adoption = adoptMetrics(
      [metric("c1", "Cotation")],
      [metric("m1", "Cotation", { unit: "kg" }), metric("m2", "Cotation (C)")],
      "C",
    );
    expect([...adoption.reused]).toEqual([["c1", "m2"]]);
    expect(adoption.created).toEqual([]);
  });

  it("numérote quand le libellé suffixé porte lui aussi une autre nature", () => {
    const adoption = adoptMetrics(
      [metric("c1", "Cotation")],
      [metric("m1", "Cotation", { unit: "kg" }), metric("m2", "Cotation (C)", { unit: "kg" })],
      "C",
    );
    expect(adoption.created.map((c) => c.definition.label)).toEqual(["Cotation (C 2)"]);
  });

  it("coupe le libellé pour que le suffixe tienne", () => {
    const long = "x".repeat(CUSTOM_METRIC_LABEL_MAX_LENGTH);
    const adoption = adoptMetrics([metric("c1", long)], [metric("m1", long, SCALE)], "C");
    const [label] = adoption.created.map((c) => c.definition.label);
    expect(label).toBe(`${"x".repeat(CUSTOM_METRIC_LABEL_MAX_LENGTH - 4)} (C)`);
  });

  it("ne crée pas deux fois un libellé que deux métriques coupées partagent", () => {
    const base = "x".repeat(CUSTOM_METRIC_LABEL_MAX_LENGTH - 1);
    const catalog = [metric("m1", `${base}1`, SCALE), metric("m2", `${base}2`, SCALE)];
    const adoption = adoptMetrics(
      [metric("c1", `${base}1`), metric("c2", `${base}2`)],
      catalog,
      "C",
    );
    const labels = adoption.created.map((c) => c.definition.label);
    expect(new Set(labels).size).toBe(2);
    expect(labels.every((label) => label.length <= CUSTOM_METRIC_LABEL_MAX_LENGTH)).toBe(true);
  });

  it("coupe aussi un nom de propriétaire qui ne laisse aucune place", () => {
    const owner = "N".repeat(CUSTOM_METRIC_LABEL_MAX_LENGTH);
    const adoption = adoptMetrics(
      [metric("c1", "Cotation")],
      [metric("m1", "Cotation", SCALE)],
      owner,
    );
    const [label] = adoption.created.map((c) => c.definition.label);
    expect(label).toHaveLength(CUSTOM_METRIC_LABEL_MAX_LENGTH);
    expect(label?.startsWith("C (N")).toBe(true);
  });

  // Coupé au-delà du rang, chaque rang rendait le même libellé : la recherche ne finissait pas.
  it("garde le rang quand le nom ne laisse aucune place, et finit", () => {
    const owner = "N".repeat(CUSTOM_METRIC_LABEL_MAX_LENGTH);
    const taken = adoptMetrics([metric("c0", "A")], [metric("m0", "A", SCALE)], owner);
    const first = taken.created[0]?.definition.label ?? "";
    const adoption = adoptMetrics(
      [metric("c1", "AB"), metric("c2", "AC")],
      [metric("m1", "AB", SCALE), metric("m2", "AC", SCALE), metric("m3", first, SCALE)],
      owner,
    );
    const labels = adoption.created.map((c) => c.definition.label);
    expect(labels).toHaveLength(2);
    expect(new Set(labels).size).toBe(2);
    expect(labels.every((label) => label.length <= CUSTOM_METRIC_LABEL_MAX_LENGTH)).toBe(true);
    expect(labels.every((label) => / \d+\)$/.test(label))).toBe(true);
  });
});

describe("remapCustomMetrics", () => {
  const blocks = [
    {
      id: "b1",
      label: null,
      structure: { type: "SETS", setCount: 1 },
      metrics: [
        { id: "k1", source: MetricSource.CUSTOM, customMetricId: "c1" },
        { id: "k2", source: MetricSource.CUSTOM, customMetricId: "gone" },
        { id: "k3", source: MetricSource.CATALOG, key: "REPS", unit: "REPS" },
      ],
      rows: [{ id: "r1", values: { k1: 3 } }],
    },
  ] as unknown as ExerciseBlocks;

  it("cite le catalogue du destinataire et laisse une citation inconnue telle quelle", () => {
    const [block] = remapCustomMetrics(blocks, new Map([["c1", "m1"]]));
    expect(block?.metrics).toEqual([
      { id: "k1", source: MetricSource.CUSTOM, customMetricId: "m1" },
      { id: "k2", source: MetricSource.CUSTOM, customMetricId: "gone" },
      { id: "k3", source: MetricSource.CATALOG, key: "REPS", unit: "REPS" },
    ]);
    // Les valeurs suivent l'identifiant de COLONNE, qui ne bouge pas.
    expect(block?.rows).toEqual([{ id: "r1", values: { k1: 3 } }]);
  });
});

describe("remapCustomMetrics sur une grille (#716)", () => {
  it("réécrit la colonne du Coach et garde ses valeurs, sous le même identifiant de colonne", () => {
    const grid = gridOf([reps, custom], [6, 3]);
    const [remapped] = remapCustomMetrics([grid], new Map([["metric_1", "metric_m"]]));
    expect(remapped?.metrics).toEqual([reps, { ...custom, customMetricId: "metric_m" }]);
    expect(remapped?.rows).toEqual(grid.rows);
  });
});
