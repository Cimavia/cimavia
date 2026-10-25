import { describe, expect, it } from "vitest";
import { gridOf, oneByBeep, presets, reps } from "../../test/block-fixtures";
import { SESSION_MAX_EXERCISES } from "./session.schema";
import {
  BLOCK_MAX_EXERCISES,
  CompositionOrigin,
  referencePlaceOf,
  SESSION_MAX_BLOCKS,
  scheduledSessionBlockSchema,
  scheduledSessionBlocksSchema,
  sessionBlockSchema,
  sessionBlocksSchema,
} from "./session-block.schema";
import { StructurePresetKey } from "./structure.schema";

const exercise = (key: string) => ({
  key,
  exerciseId: `exercise_${key}`,
  note: null,
  grid: gridOf([reps], [6]),
});

const block = (id: string, keys: string[], overrides: object = {}) => ({
  id,
  name: "Séries",
  label: null,
  instructions: null,
  settings: presets.SERIES,
  copiedSettings: presets.SERIES,
  sourceStructureId: null,
  sourcePreset: StructurePresetKey.SERIES,
  exercises: keys.map(exercise),
  ...overrides,
});

describe("sessionBlockSchema", () => {
  it("accepte un bloc copié d'une structure prête", () => {
    expect(sessionBlockSchema.safeParse(block("b1", ["a"])).success).toBe(true);
  });

  it("accepte un bloc dont la structure a été supprimée : son origine est `null`", () => {
    expect(sessionBlockSchema.safeParse(block("b1", ["a"], { sourcePreset: null })).success).toBe(
      true,
    );
  });

  it("refuse un bloc qui viendrait de deux structures", () => {
    const both = block("b1", ["a"], { sourceStructureId: "structure_1" });
    expect(sessionBlockSchema.safeParse(both).success).toBe(false);
  });

  it("contient de 1 à 20 exercices", () => {
    expect(sessionBlockSchema.safeParse(block("b1", [])).success).toBe(false);
    const many = Array.from({ length: BLOCK_MAX_EXERCISES + 1 }, (_unused, index) => `e${index}`);
    expect(sessionBlockSchema.safeParse(block("b1", many)).success).toBe(false);
  });

  it("refuse « un seul par bip » avec moins de bips que d'exercices", () => {
    const settings = oneByBeep(60, 2);
    const parsed = sessionBlockSchema.safeParse(block("b1", ["a", "b", "c"], { settings }));
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(["settings"]);
    expect(sessionBlockSchema.safeParse(block("b1", ["a", "b"], { settings })).success).toBe(true);
  });

  it("refuse une grille qui a plus de lignes que le bloc n'a de tours", () => {
    const withRows = (count: number) => ({
      ...exercise("a"),
      grid: gridOf([reps], ...Array.from({ length: count }, () => [6])),
    });
    const parse = (settings: object, count: number) =>
      sessionBlockSchema.safeParse({ ...block("b1", []), settings, exercises: [withRows(count)] });
    expect(parse(presets.SERIES, 4).success).toBe(true);
    expect(parse(presets.SERIES, 5).error?.issues.map((issue) => issue.path.join("."))).toEqual([
      "exercises.0.grid.rows",
    ]);
    expect(parse(presets.FREE, 2).success).toBe(false);
  });

  it("refuse un libellé vide : sans libellé, c'est `null`", () => {
    expect(sessionBlockSchema.safeParse(block("b1", ["a"], { label: " " })).success).toBe(false);
  });
});

describe("scheduledSessionBlockSchema", () => {
  const scheduled = (origin: object) => ({
    ...block("b1", []),
    exercises: [{ ...exercise("a"), origin }],
  });

  it("porte l'origine de chaque exercice", () => {
    expect(
      scheduledSessionBlockSchema.safeParse(scheduled({ kind: CompositionOrigin.RECEIVED }))
        .success,
    ).toBe(true);
    expect(
      scheduledSessionBlockSchema.safeParse(
        scheduled({ kind: CompositionOrigin.REPLACEMENT, replacesKey: "x" }),
      ).success,
    ).toBe(true);
  });

  it("refuse un remplaçant qui ne dit pas ce qu'il remplace, et un exercice sans origine", () => {
    expect(
      scheduledSessionBlockSchema.safeParse(scheduled({ kind: CompositionOrigin.REPLACEMENT }))
        .success,
    ).toBe(false);
    expect(scheduledSessionBlockSchema.safeParse(block("b1", ["a"])).success).toBe(false);
  });
});

describe("sessionBlocksSchema", () => {
  it("accepte une séance de plusieurs blocs", () => {
    expect(
      sessionBlocksSchema.safeParse([block("b1", ["a"]), block("b2", ["b", "c"])]).success,
    ).toBe(true);
  });

  it("borne la séance à 30 blocs", () => {
    const blocks = Array.from({ length: SESSION_MAX_BLOCKS + 1 }, (_unused, index) =>
      block(`b${index}`, [`e${index}`]),
    );
    expect(sessionBlocksSchema.safeParse(blocks).success).toBe(false);
  });

  it("borne la séance à 50 exercices, tous blocs confondus", () => {
    const blocks = Array.from({ length: 3 }, (_unused, b) =>
      block(
        `b${b}`,
        Array.from({ length: 17 }, (_unused2, e) => `e${b}_${e}`),
      ),
    );
    expect(blocks.flatMap((item) => item.exercises)).toHaveLength(SESSION_MAX_EXERCISES + 1);
    expect(sessionBlocksSchema.safeParse(blocks).success).toBe(false);
  });

  it("refuse une clé d'exercice en double d'un bloc à l'autre, et un bloc en double", () => {
    expect(sessionBlocksSchema.safeParse([block("b1", ["a"]), block("b2", ["a"])]).success).toBe(
      false,
    );
    expect(sessionBlocksSchema.safeParse([block("b1", ["a"]), block("b1", ["b"])]).success).toBe(
      false,
    );
  });

  it("vaut aussi pour les blocs planifiés", () => {
    const scheduled = {
      ...block("b1", []),
      exercises: [{ ...exercise("a"), origin: { kind: CompositionOrigin.ADDED } }],
    };
    expect(scheduledSessionBlocksSchema.safeParse([scheduled]).success).toBe(true);
    expect(scheduledSessionBlocksSchema.safeParse([scheduled, scheduled]).success).toBe(false);
  });
});

describe("la place des exercices planifiés dans la séance-type", () => {
  const received = (key: string) => ({
    ...exercise(key),
    origin: { kind: CompositionOrigin.RECEIVED },
  });
  const added = (key: string) => ({ ...exercise(key), origin: { kind: CompositionOrigin.ADDED } });
  const replacing = (key: string, replacesKey: string) => ({
    ...exercise(key),
    origin: { kind: CompositionOrigin.REPLACEMENT, replacesKey },
  });
  const parse = (...exercises: object[]) =>
    scheduledSessionBlocksSchema.safeParse([{ ...block("b1", []), exercises }]).success;

  it("est la sienne pour un exercice reçu, celle qu'il remplace pour un remplaçant, aucune pour un ajout", () => {
    expect(referencePlaceOf(received("a"))).toBe("a");
    expect(referencePlaceOf(replacing("a2", "a"))).toBe("a");
    expect(referencePlaceOf(added("a"))).toBeNull();
  });

  it("n'est occupée qu'une fois : ni un exercice et son remplaçant, ni deux remplaçants", () => {
    expect(parse(received("a"), replacing("b2", "b"), added("c"))).toBe(true);
    expect(parse(received("a"), replacing("a2", "a"))).toBe(false);
    expect(parse(replacing("a2", "a"), replacing("a3", "a"))).toBe(false);
  });
});
