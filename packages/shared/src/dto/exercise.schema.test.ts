import { describe, expect, it } from "vitest";
import {
  createExerciseSchema,
  EXERCISE_MAX_TAGS,
  ExerciseCategory,
  exerciseTagsSchema,
  updateExerciseSchema,
} from "./exercise.schema";

describe("exerciseTagsSchema", () => {
  it("normalise en minuscules et coupe les espaces", () => {
    expect(exerciseTagsSchema.parse(["  Renfo  ", "GRIMPE"])).toEqual(["renfo", "grimpe"]);
  });

  it("refuse deux tags identiques APRÈS normalisation", () => {
    expect(exerciseTagsSchema.safeParse(["Renfo", "renfo"]).success).toBe(false);
  });

  it("refuse un tag vide ou fait d'espaces", () => {
    expect(exerciseTagsSchema.safeParse([""]).success).toBe(false);
    expect(exerciseTagsSchema.safeParse(["   "]).success).toBe(false);
  });

  it("accepte une liste vide — un exercice sans tag est légitime", () => {
    expect(exerciseTagsSchema.parse([])).toEqual([]);
  });

  it("refuse au-delà du plafond", () => {
    const tags = Array.from({ length: EXERCISE_MAX_TAGS + 1 }, (_, i) => `tag${i}`);
    expect(exerciseTagsSchema.safeParse(tags).success).toBe(false);
  });
});

describe("createExerciseSchema", () => {
  const base = { title: "Tractions lestées", category: ExerciseCategory.RENFO };

  it("accepte un exercice sans tags — le champ est facultatif", () => {
    expect(createExerciseSchema.parse(base).tags).toBeUndefined();
  });

  it("normalise les tags fournis", () => {
    expect(createExerciseSchema.parse({ ...base, tags: ["Force"] }).tags).toEqual(["force"]);
  });

  it("refuse un champ inconnu (schéma strict)", () => {
    expect(createExerciseSchema.safeParse({ ...base, blocks: [] }).success).toBe(false);
  });
});

describe("updateExerciseSchema", () => {
  it("distingue « tags absents » de « tags vidés »", () => {
    // undefined : ne touche pas aux tags. [] : les retire tous. La différence porte l'intention,
    // et le service s'en sert pour ne réécrire que sur demande explicite.
    expect(updateExerciseSchema.parse({ title: "x" }).tags).toBeUndefined();
    expect(updateExerciseSchema.parse({ tags: [] }).tags).toEqual([]);
  });
});
