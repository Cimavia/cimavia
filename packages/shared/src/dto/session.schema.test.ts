import { describe, expect, it } from "vitest";
import { gridOf, presets, reps } from "../../test/block-fixtures";
import { createSessionSchema, updateSessionSchema } from "./session.schema";
import { StructurePresetKey } from "./structure.schema";

const VERSION = "2026-10-12T08:00:00.000Z";

const blocks = [
  {
    id: "b1",
    name: "Séries",
    label: null,
    instructions: null,
    settings: presets.SERIES,
    copiedSettings: presets.SERIES,
    sourceStructureId: null,
    sourcePreset: StructurePresetKey.SERIES,
    exercises: [{ key: "a", exerciseId: "ex_1", note: null, grid: gridOf([reps], [6]) }],
  },
];

describe("version citée par les écritures d'une séance modèle (#604)", () => {
  it("exige la version lue à l'édition", () => {
    expect(updateSessionSchema.safeParse({ title: "Bloc", blocks: [] }).success).toBe(false);
    expect(
      updateSessionSchema.safeParse({ title: "Bloc", blocks: [], expectedUpdatedAt: VERSION })
        .success,
    ).toBe(true);
  });
});

describe("composition par blocs (#716, #723)", () => {
  const update = (composition: object) =>
    updateSessionSchema.safeParse({ title: "Bloc", expectedUpdatedAt: VERSION, ...composition });

  it("crée une séance par blocs, ou vide", () => {
    expect(createSessionSchema.parse({ title: "Bloc", blocks }).blocks).toHaveLength(1);
    expect(createSessionSchema.parse({ title: "Bloc" }).blocks).toEqual([]);
  });

  it("exige les blocs à l'édition : elle remplace toute la composition", () => {
    expect(update({ blocks }).success).toBe(true);
    expect(update({}).success).toBe(false);
  });

  it("refuse l'ancienne composition par exercices", () => {
    expect(createSessionSchema.safeParse({ title: "Bloc", exercises: [] }).success).toBe(false);
    expect(update({ blocks, exercises: [] }).success).toBe(false);
  });

  it("vérifie les blocs eux-mêmes : un bloc sans exercice est refusé", () => {
    expect(update({ blocks: [{ ...blocks[0], exercises: [] }] }).success).toBe(false);
  });
});
