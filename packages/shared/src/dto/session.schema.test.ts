import { describe, expect, it } from "vitest";
import {
  createSessionSchema,
  reloadSessionExerciseSchema,
  SESSION_MAX_EXERCISES,
  SESSION_TOO_MANY_EXERCISES_MESSAGE,
  updateSessionSchema,
} from "./session.schema";

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
