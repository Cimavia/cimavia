import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { compositionSummary } from "./composition.util";

const t = ((key: string, params: { count: number }) => `${key}:${params.count}`) as TFunction;

describe("compositionSummary", () => {
  it("dit les blocs puis les exercices", () => {
    expect(compositionSummary({ blockCount: 3, exerciseCount: 7 }, t)).toBe(
      "common.composition.blocks:3 · common.composition.exercises:7",
    );
  });

  it("ne dit que les exercices d'une séance sans blocs", () => {
    expect(compositionSummary({ blockCount: 0, exerciseCount: 2 }, t)).toBe(
      "common.composition.exercises:2",
    );
  });
});
