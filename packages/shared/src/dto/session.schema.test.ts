import { describe, expect, it } from "vitest";
import { gridOf, presets, reps } from "../../test/block-fixtures";
import {
  createSessionSchema,
  reloadSessionExerciseSchema,
  SESSION_MAX_EXERCISES,
  SESSION_TOO_MANY_EXERCISES_MESSAGE,
  updateSessionSchema,
} from "./session.schema";
import { StructurePresetKey } from "./structure.schema";

const VERSION = "2026-10-12T08:00:00.000Z";

/**
 * Le même exercice cité à chaque ligne : c'est la forme qui coûtait (#297), chaque ligne faisant
 * recopier les blocs de l'exercice. Une séance peut légitimement citer deux fois le même.
 */
const lines = (count: number) => Array.from({ length: count }, () => ({ exerciseId: "ex_1" }));

describe("plafond d'exercices d'une séance modèle (#297)", () => {
  it.each([
    ["la création", createSessionSchema, {}],
    ["l'édition", updateSessionSchema, { expectedUpdatedAt: VERSION }],
  ])("%s accepte le plafond et refuse un exercice de plus", (_, schema, version) => {
    expect(
      schema.safeParse({ title: "Bloc", exercises: lines(SESSION_MAX_EXERCISES), ...version })
        .success,
    ).toBe(true);
    const result = schema.safeParse({
      title: "Bloc",
      exercises: lines(SESSION_MAX_EXERCISES + 1),
      ...version,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(SESSION_TOO_MANY_EXERCISES_MESSAGE);
  });

  it("garde une séance sans exercice à la création", () => {
    expect(createSessionSchema.parse({ title: "Bloc" }).exercises).toEqual([]);
  });
});

describe("version citée par les écritures d'une séance modèle (#604)", () => {
  it("exige la version lue à l'édition", () => {
    expect(updateSessionSchema.safeParse({ title: "Bloc", exercises: [] }).success).toBe(false);
    expect(
      updateSessionSchema.safeParse({ title: "Bloc", exercises: [], expectedUpdatedAt: VERSION })
        .success,
    ).toBe(true);
  });

  it("exige la version lue pour recharger un exercice depuis la bibliothèque", () => {
    expect(reloadSessionExerciseSchema.safeParse({}).success).toBe(false);
    expect(reloadSessionExerciseSchema.safeParse({ expectedUpdatedAt: VERSION }).success).toBe(
      true,
    );
  });
});

describe("composition par exercices ou par blocs (#716)", () => {
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
  const ONE_COMPOSITION =
    "Une séance se compose par exercices ou par blocs, pas les deux à la fois.";
  const update = (composition: object) =>
    updateSessionSchema.safeParse({ title: "Bloc", expectedUpdatedAt: VERSION, ...composition });

  it("crée une séance par blocs, ou par exercices, pas les deux", () => {
    expect(createSessionSchema.parse({ title: "Bloc", blocks }).blocks).toHaveLength(1);
    const both = createSessionSchema.safeParse({ title: "Bloc", blocks, exercises: lines(1) });
    expect(both.error?.issues[0]?.message).toBe(ONE_COMPOSITION);
  });

  it("enregistre l'une des deux compositions, exactement", () => {
    expect(update({ blocks }).success).toBe(true);
    expect(update({ exercises: [] }).success).toBe(true);
    expect(update({}).error?.issues[0]?.message).toBe(ONE_COMPOSITION);
    expect(update({ blocks, exercises: [] }).error?.issues[0]?.message).toBe(ONE_COMPOSITION);
  });

  it("vérifie les blocs eux-mêmes : un bloc sans exercice est refusé", () => {
    expect(update({ blocks: [{ ...blocks[0], exercises: [] }] }).success).toBe(false);
  });
});
