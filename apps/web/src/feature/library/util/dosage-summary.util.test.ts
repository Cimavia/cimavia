import {
  type BlockMetric,
  BlockType,
  type CustomMetric,
  type ExerciseBlock,
  MetricKey,
  MetricSource,
  MetricUnit,
  MetricValueType,
} from "@cmv/shared";
import { describe, expect, it } from "vitest";
import { fakeT } from "../../../../test/translator";
import { baselineValue, collapsedCount, dosageSummary } from "./dosage-summary.util";

const reps: BlockMetric = {
  id: "m-reps",
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS,
  label: null,
  collapsed: false,
};

const effortDuration: BlockMetric = {
  id: "m-duration",
  source: MetricSource.CATALOG,
  key: MetricKey.REST_BETWEEN_SETS,
  unit: MetricUnit.NONE,
  label: null,
  collapsed: false,
};

const customColumn: BlockMetric = {
  id: "m-custom",
  source: MetricSource.CUSTOM,
  customMetricId: "cm-1",
  label: null,
  collapsed: false,
};

const cotation: CustomMetric = {
  id: "cm-1",
  label: "Cotation",
  unit: "Fb",
  valueType: MetricValueType.TEXT,
  scale: null,
};

const seriesBlock = (over: Partial<ExerciseBlock> = {}): ExerciseBlock => ({
  id: "b-1",
  label: null,
  structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: null },
  metrics: [reps],
  rows: [{ id: "r-1", values: { "m-reps": 6 } }],
  ...over,
});

describe("dosageSummary", () => {
  it("assemble structure, valeurs et repos dans cet ordre", () => {
    const block = seriesBlock({
      structure: { type: BlockType.SERIES, setCount: 4, restBetweenSetsSeconds: 150 },
    });
    const parts = dosageSummary([block], [], fakeT)?.split(", ");
    expect(parts?.at(0)).toContain("exercise.dosage.series");
    expect(parts?.at(1)).toContain("6");
    expect(parts?.at(2)).toContain("exercise.dosage.restBetweenSets");
  });

  /**
   * `null` et non « aucun dosage » : un exercice sans bloc est légitime, et nommer cette absence
   * mettrait du bruit sur un choix du coach (règle dure n°5).
   */
  it("rend null quand il n'y a aucun bloc à résumer", () => {
    expect(dosageSummary([], [], fakeT)).toBeNull();
  });

  it("sépare deux blocs par un point médian", () => {
    const summary = dosageSummary([seriesBlock(), seriesBlock({ id: "b-2" })], [], fakeT);
    expect(summary?.split(" · ")).toHaveLength(2);
  });

  it("ne montre que la PREMIÈRE ligne : une carte repliée ne peut pas en montrer cinq", () => {
    const block = seriesBlock({
      rows: [
        { id: "r-1", values: { "m-reps": 6 } },
        { id: "r-2", values: { "m-reps": 99 } },
      ],
    });
    expect(dosageSummary([block], [], fakeT)).not.toContain("99");
  });

  it("saute une colonne sans valeur au lieu d'écrire un tiret dans la phrase", () => {
    const block = seriesBlock({
      metrics: [reps, customColumn],
      rows: [{ id: "r-1", values: { "m-reps": 6 } }],
    });
    expect(dosageSummary([block], [cotation], fakeT)).not.toContain("—");
  });

  it("met en forme une durée plutôt que d'écrire des secondes brutes", () => {
    const block = seriesBlock({
      metrics: [effortDuration],
      rows: [{ id: "r-1", values: { "m-duration": 150 } }],
    });
    expect(dosageSummary([block], [], fakeT)).toContain("2'30");
  });

  it("tient un bloc sans aucune ligne, qui est un état enregistrable", () => {
    expect(dosageSummary([seriesBlock({ rows: [] })], [], fakeT)).toContain(
      "exercise.dosage.series",
    );
  });
});

describe("collapsedCount", () => {
  it("compte les seules colonnes repliées", () => {
    const block = seriesBlock({ metrics: [reps, { ...customColumn, collapsed: true }] });
    expect(collapsedCount(block)).toBe(1);
  });
});

describe("baselineValue", () => {
  const baseline = [seriesBlock()];

  it("retrouve la valeur de référence d'une case", () => {
    expect(baselineValue(baseline, "b-1", "r-1", "m-reps")).toBe(6);
  });

  /**
   * `null` sur chaque maillon manquant — bloc, ligne ou colonne. C'est ce qui fait disparaître
   * l'indice « défaut … » au lieu d'afficher un zéro qui n'a jamais été la référence.
   */
  it.each([
    ["bloc", "b-inconnu", "r-1", "m-reps"],
    ["ligne", "b-1", "r-inconnue", "m-reps"],
    ["colonne", "b-1", "r-1", "m-inconnue"],
  ])("rend null quand le %s n'existe pas", (_maillon, blockId, rowId, metricId) => {
    expect(baselineValue(baseline, blockId, rowId, metricId)).toBeNull();
  });
});
