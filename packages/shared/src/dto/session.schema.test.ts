import { describe, expect, it } from "vitest";
import {
  createSessionSchema,
  SESSION_MAX_EXERCISES,
  SESSION_TOO_MANY_EXERCISES_MESSAGE,
  updateSessionSchema,
} from "./session.schema";

/**
 * Le même exercice cité à chaque ligne : c'est la forme qui coûtait (#297), chaque ligne faisant
 * recopier les blocs de l'exercice. Une séance peut légitimement citer deux fois le même.
 */
const lines = (count: number) => Array.from({ length: count }, () => ({ exerciseId: "ex_1" }));

describe("plafond d'exercices d'une séance modèle (#297)", () => {
  it.each([
    ["la création", createSessionSchema],
    ["l'édition", updateSessionSchema],
  ])("%s accepte le plafond et refuse un exercice de plus", (_, schema) => {
    expect(
      schema.safeParse({ title: "Bloc", exercises: lines(SESSION_MAX_EXERCISES) }).success,
    ).toBe(true);
    const result = schema.safeParse({ title: "Bloc", exercises: lines(SESSION_MAX_EXERCISES + 1) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(SESSION_TOO_MANY_EXERCISES_MESSAGE);
  });

  it("garde une séance sans exercice à la création", () => {
    expect(createSessionSchema.parse({ title: "Bloc" }).exercises).toEqual([]);
  });
});
