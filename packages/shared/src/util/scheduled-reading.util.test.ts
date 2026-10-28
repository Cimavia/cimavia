import { describe, expect, it } from "vitest";
import { gridOf, presets, reps } from "../../test/block-fixtures";
import type { ScheduledSessionDto } from "../dto/plan.schema";
import { blockHeading, readScheduledBlocks } from "./scheduled-reading.util";

const row = (id: string, key: string) => ({
  id,
  key,
  note: null,
  grid: gridOf([reps], [8]),
  origin: { kind: "RECEIVED" as const },
});

const block = (id: string, label: string | null, rows: ReturnType<typeof row>[]) => ({
  id,
  name: "Séries",
  label,
  instructions: null,
  settings: presets.SERIES,
  copiedSettings: presets.SERIES,
  sourceStructureId: null,
  sourcePreset: null,
  baseline: { settings: presets.SERIES, exercises: [] },
  tracking: null,
  exercises: rows,
});

const content = (id: string, title: string) => ({ id, title });

const session = {
  exercises: [content("sx-1", "Squat"), content("sx-2", "Tractions"), content("sx-3", "Gainage")],
  blocks: [
    block("blk-1", null, [row("sx-1", "a1")]),
    block("blk-2", "Finisher", [row("sx-3", "c1")]),
    block("blk-3", null, [row("sx-2", "b1"), row("sx-1", "b2")]),
  ],
} as unknown as ScheduledSessionDto;

describe("readScheduledBlocks", () => {
  it("numérote les blocs sans libellé et code leurs exercices", () => {
    const read = readScheduledBlocks(session);
    expect(read.map((item) => item.number)).toEqual(["1", null, "2"]);
    expect(read[2]?.exercises.map((exercise) => exercise.code)).toEqual(["2.1", "2.2"]);
    expect(read[1]?.exercises.map((exercise) => exercise.code)).toEqual([null]);
  });

  it("relie chaque exercice de bloc à son contenu, par son identifiant", () => {
    const read = readScheduledBlocks(session);
    expect(read[2]?.names).toEqual(["Tractions", "Squat"]);
    expect(read[2]?.labels).toEqual(["2.1", "2.2"]);
    // Un bloc à libellé n'a pas de code : la ligne d'un tour cite les titres.
    expect(read[1]?.labels).toEqual(["Gainage"]);
  });

  it("refuse un exercice de bloc dont la séance n'a pas le contenu", () => {
    const broken = { ...session, exercises: [] } as unknown as ScheduledSessionDto;
    expect(() => readScheduledBlocks(broken)).toThrow();
  });
});

describe("blockHeading", () => {
  it("dit le numéro, le libellé à défaut", () => {
    const [first, second] = readScheduledBlocks(session);
    expect(first && blockHeading(first)).toBe("1");
    expect(second && blockHeading(second)).toBe("Finisher");
  });
});
