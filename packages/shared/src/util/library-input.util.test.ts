import { describe, expect, it } from "vitest";
import { MetricKey, MetricUnit } from "../dto/exercise-metric.schema";
import { MetricSource } from "../dto/metric-reference.schema";
import { RichBlockType, type RichDocument } from "../dto/rich-document.schema";
import type { SuggestedMetric } from "../dto/suggested-metric.schema";
import { toExerciseInput } from "./library-input.util";

describe("toExerciseInput", () => {
  it("rogne le titre", () => {
    const input = toExerciseInput({
      title: "  Gainage  ",
      tags: [],
      instructions: null,
      suggestedMetrics: [],
    });
    expect(input.title).toBe("Gainage");
  });

  // « Pas de consigne » est une absence : un document vide part en `null` (règle nullable n°5).
  it("envoie une consigne vide en null", () => {
    expect(
      toExerciseInput({ title: "x", tags: [], instructions: [], suggestedMetrics: [] })
        .instructions,
    ).toBeNull();
    expect(
      toExerciseInput({ title: "x", tags: [], instructions: null, suggestedMetrics: [] })
        .instructions,
    ).toBeNull();
  });

  it("garde une consigne écrite, les tags et les métriques suggérées tels quels", () => {
    const instructions: RichDocument = [
      { type: RichBlockType.PARAGRAPH, content: [{ text: "Dos droit" }] },
    ];
    const suggestedMetrics: SuggestedMetric[] = [
      { source: MetricSource.CATALOG, key: MetricKey.REPETITIONS, unit: MetricUnit.REPS },
      { source: MetricSource.CUSTOM, customMetricId: "cm-1" },
    ];
    const input = toExerciseInput({ title: "x", tags: ["core"], instructions, suggestedMetrics });
    expect(input).toEqual({ title: "x", tags: ["core"], instructions, suggestedMetrics });
  });
});
