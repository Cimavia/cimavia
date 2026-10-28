import {
  type BlockGrid,
  CompositionOrigin,
  type CustomMetric,
  type ScheduledSessionBlockDto,
  STRUCTURE_PRESETS,
  StructurePresetKey,
} from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { assertComposable, definitionsOf } from "./scheduled-composition.rules";
import type { ComposedRow } from "./scheduled-session.writer";

const SERIES = STRUCTURE_PRESETS[StructurePresetKey.SERIES];
const GRID: BlockGrid = { metrics: [], rows: [] };

/** Le bloc stocké : Tractions (`a1`) reçue de la séance-type. */
const stored = [
  {
    name: "Séries",
    baseline: {
      settings: SERIES,
      exercises: [{ key: "a1", exerciseId: "ex-a", note: null, grid: GRID }],
    },
  },
] as unknown as ScheduledSessionBlockDto[];

const row = (key: string, kind: string): ComposedRow =>
  ({ key, origin: { kind }, note: null, grid: GRID }) as ComposedRow;

const plannedBlock = (exercises: ComposedRow[]) => ({
  settings: SERIES,
  baseline: stored[0]?.baseline as ScheduledSessionBlockDto["baseline"],
  exercises,
});

describe("assertComposable", () => {
  it("laisse passer une composition qui garde les blocs et prend des clés neuves", () => {
    const blocks = [
      plannedBlock([row("a1", CompositionOrigin.RECEIVED), row("x1", CompositionOrigin.ADDED)]),
    ];

    expect(() => assertComposable(stored, blocks, ["a1", "a2"])).not.toThrow();
  });

  it("refuse une composition qui n'a plus les blocs stockés", () => {
    const blocks = [
      plannedBlock([row("a1", CompositionOrigin.RECEIVED)]),
      plannedBlock([row("x1", CompositionOrigin.ADDED)]),
    ];

    expect(() => assertComposable(stored, blocks, [])).toThrow(BadRequestException);
  });

  it("refuse un exercice nouveau sous une clé de la séance-type courante", () => {
    const blocks = [
      plannedBlock([row("a1", CompositionOrigin.RECEIVED), row("a2", CompositionOrigin.ADDED)]),
    ];

    expect(() => assertComposable(stored, blocks, ["a1", "a2"])).toThrow(
      "Un exercice nouveau prend une clé de la séance-type",
    );
  });
});

describe("definitionsOf", () => {
  const cited: ComposedRow = {
    ...row("x1", CompositionOrigin.ADDED),
    grid: {
      metrics: [{ id: "col", source: "CUSTOM", customMetricId: "cm-1", label: null }],
      rows: [],
    } as unknown as BlockGrid,
  };
  const frozen = { id: "cm-1", label: "Cotation figée" } as CustomMetric;
  const catalogRow = (id: string, label: string) =>
    ({ id, label, unit: null, valueType: "NUMBER", scale: null }) as never;

  it("prend d'abord la définition figée, une seule fois, et rien de ce que la grille ne cite pas", () => {
    const definitions = definitionsOf(
      cited,
      [frozen, frozen],
      [catalogRow("cm-1", "Cotation"), catalogRow("cm-2", "Autre")],
    );

    expect(definitions).toEqual([frozen]);
  });

  it("à défaut, prend celle du catalogue", () => {
    const definitions = definitionsOf(cited, [], [catalogRow("cm-1", "Cotation")]);

    expect(definitions.map((metric) => metric.label)).toEqual(["Cotation"]);
  });
});
