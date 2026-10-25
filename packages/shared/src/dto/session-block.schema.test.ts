import { describe, expect, it } from "vitest";
import { gridOf, issuesOf, oneByBeep, presets, reps } from "../../test/block-fixtures";
import { SESSION_MAX_EXERCISES, SESSION_NOTE_MAX_LENGTH } from "./session.schema";
import {
  BLOCK_MAX_EXERCISES,
  CompositionOrigin,
  referencePlaceOf,
  SESSION_BLOCK_LABEL_MAX_LENGTH,
  SESSION_MAX_BLOCKS,
  scheduledSessionBlockSchema,
  scheduledSessionBlocksSchema,
  sessionBlockSchema,
  sessionBlocksSchema,
} from "./session-block.schema";
import {
  STRUCTURE_INSTRUCTIONS_MAX_LENGTH,
  STRUCTURE_NAME_MAX_LENGTH,
  StructurePresetKey,
} from "./structure.schema";

const exercise = (key: string, overrides: object = {}) => ({
  key,
  exerciseId: `exercise_${key}`,
  note: null,
  grid: gridOf([reps], [6]),
  ...overrides,
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
  exercises: keys.map((key) => exercise(key)),
  ...overrides,
});

/** `count` exercices répartis en blocs de 17 au plus. */
function blocksWith(count: number) {
  return Array.from({ length: Math.ceil(count / 17) }, (_unused, b) =>
    block(
      `b${b}`,
      Array.from({ length: Math.min(17, count - b * 17) }, (_unused2, e) => `e${b}_${e}`),
    ),
  );
}

const textOf = (length: number) => "x".repeat(length);

describe("sessionBlockSchema", () => {
  it("accepte un bloc copié d'une structure prête, ou d'une structure du Coach", () => {
    expect(issuesOf(sessionBlockSchema, block("b1", ["a"]))).toEqual([]);
    const fromCoach = { sourceStructureId: "structure_1", sourcePreset: null };
    expect(issuesOf(sessionBlockSchema, block("b1", ["a"], fromCoach))).toEqual([]);
  });

  it("accepte un bloc dont la structure a été supprimée : son origine est `null`", () => {
    expect(issuesOf(sessionBlockSchema, block("b1", ["a"], { sourcePreset: null }))).toEqual([]);
  });

  it("refuse un bloc qui viendrait de deux structures", () => {
    const both = block("b1", ["a"], { sourceStructureId: "structure_1" });
    expect(issuesOf(sessionBlockSchema, both)).toEqual([
      "sourcePreset: Un bloc vient d'une structure prête ou d'une structure du Coach, pas des deux.",
    ]);
  });

  it("contient de 1 à 20 exercices", () => {
    expect(sessionBlockSchema.safeParse(block("b1", [])).success).toBe(false);
    const many = Array.from({ length: BLOCK_MAX_EXERCISES + 1 }, (_unused, index) => `e${index}`);
    expect(sessionBlockSchema.safeParse(block("b1", many)).success).toBe(false);
  });

  it("refuse « un seul par bip » avec moins de bips que d'exercices", () => {
    const settings = oneByBeep(60, 2);
    expect(issuesOf(sessionBlockSchema, block("b1", ["a", "b", "c"], { settings }))).toEqual([
      "settings: « Un seul par… » demande au moins autant de bips ou d'intervalles que d'exercices.",
    ]);
    expect(issuesOf(sessionBlockSchema, block("b1", ["a", "b"], { settings }))).toEqual([]);
  });

  it("refuse une grille qui a plus de lignes que le bloc n'a de tours", () => {
    const withRows = (count: number) =>
      exercise("a", { grid: gridOf([reps], ...Array.from({ length: count }, () => [6])) });
    const parse = (settings: object, count: number) =>
      issuesOf(sessionBlockSchema, { ...block("b1", []), settings, exercises: [withRows(count)] });
    expect(parse(presets.SERIES, 4)).toEqual([]);
    expect(parse(presets.SERIES, 5)).toEqual([
      "exercises.0.grid.rows: La grille a plus de lignes que le bloc n'a de tours.",
    ]);
    expect(parse(presets.FREE, 2)).toHaveLength(1);
  });

  it("taille le nom et le libellé, et les borne", () => {
    const parsed = sessionBlockSchema.parse(block("b1", ["a"], { name: " EMOM ", label: " A " }));
    expect([parsed.name, parsed.label]).toEqual(["EMOM", "A"]);
    expect(sessionBlockSchema.safeParse(block("b1", ["a"], { name: " " })).success).toBe(false);
    expect(sessionBlockSchema.safeParse(block("b1", ["a"], { label: " " })).success).toBe(false);
    const longest = { name: textOf(STRUCTURE_NAME_MAX_LENGTH) };
    expect(issuesOf(sessionBlockSchema, block("b1", ["a"], longest))).toEqual([]);
    const tooLong = { name: textOf(STRUCTURE_NAME_MAX_LENGTH + 1) };
    expect(issuesOf(sessionBlockSchema, block("b1", ["a"], tooLong))).toHaveLength(1);
    const label = (length: number) => block("b1", ["a"], { label: textOf(length) });
    expect(issuesOf(sessionBlockSchema, label(SESSION_BLOCK_LABEL_MAX_LENGTH))).toEqual([]);
    expect(issuesOf(sessionBlockSchema, label(SESSION_BLOCK_LABEL_MAX_LENGTH + 1))).toHaveLength(1);
  });

  it("borne la consigne du bloc et la note d'un exercice", () => {
    const instructions = (length: number) => block("b1", ["a"], { instructions: textOf(length) });
    expect(issuesOf(sessionBlockSchema, instructions(STRUCTURE_INSTRUCTIONS_MAX_LENGTH))).toEqual(
      [],
    );
    expect(
      issuesOf(sessionBlockSchema, instructions(STRUCTURE_INSTRUCTIONS_MAX_LENGTH + 1)),
    ).toHaveLength(1);
    const note = (length: number) =>
      block("b1", [], { exercises: [exercise("a", { note: textOf(length) })] });
    expect(issuesOf(sessionBlockSchema, note(SESSION_NOTE_MAX_LENGTH))).toEqual([]);
    expect(issuesOf(sessionBlockSchema, note(SESSION_NOTE_MAX_LENGTH + 1))).toHaveLength(1);
  });
});

describe("scheduledSessionBlockSchema", () => {
  const scheduled = (origin: object) => block("b1", [], { exercises: [exercise("a", { origin })] });

  it("porte l'origine de chaque exercice", () => {
    expect(issuesOf(scheduledSessionBlockSchema, scheduled({ kind: "RECEIVED" }))).toEqual([]);
    const replacement = { kind: CompositionOrigin.REPLACEMENT, replacesKey: "squat" };
    expect(issuesOf(scheduledSessionBlockSchema, scheduled(replacement))).toEqual([]);
  });

  it("refuse un remplaçant qui ne dit pas ce qu'il remplace, et un exercice sans origine", () => {
    const blank = { kind: CompositionOrigin.REPLACEMENT, replacesKey: "" };
    expect(scheduledSessionBlockSchema.safeParse(scheduled(blank)).success).toBe(false);
    expect(
      scheduledSessionBlockSchema.safeParse(scheduled({ kind: CompositionOrigin.REPLACEMENT }))
        .success,
    ).toBe(false);
    expect(scheduledSessionBlockSchema.safeParse(block("b1", ["a"])).success).toBe(false);
  });
});

describe("sessionBlocksSchema", () => {
  it("accepte une séance de plusieurs blocs", () => {
    expect(issuesOf(sessionBlocksSchema, [block("b1", ["a"]), block("b2", ["b", "c"])])).toEqual(
      [],
    );
  });

  it("borne la séance à 30 blocs", () => {
    const blocks = Array.from({ length: SESSION_MAX_BLOCKS + 1 }, (_unused, index) =>
      block(`b${index}`, [`e${index}`]),
    );
    expect(issuesOf(sessionBlocksSchema, blocks)).toEqual([
      ": Une séance ne peut pas dépasser 30 blocs. [too_big]",
    ]);
  });

  it("borne la séance à 50 exercices, tous blocs confondus", () => {
    expect(issuesOf(sessionBlocksSchema, blocksWith(SESSION_MAX_EXERCISES))).toEqual([]);
    expect(issuesOf(sessionBlocksSchema, blocksWith(SESSION_MAX_EXERCISES + 1))).toEqual([
      ": Une séance ne peut pas dépasser 50 exercices.",
    ]);
  });

  it("refuse une clé d'exercice en double d'un bloc à l'autre, et un bloc en double", () => {
    expect(issuesOf(sessionBlocksSchema, [block("b1", ["a"]), block("b2", ["a"])])).toEqual([
      ": Deux exercices d'une séance ne peuvent pas partager la même clé.",
    ]);
    expect(issuesOf(sessionBlocksSchema, [block("b1", ["a"]), block("b1", ["b"])])).toEqual([
      ": Deux blocs ne peuvent pas partager le même identifiant.",
    ]);
  });

  it("vaut aussi pour les blocs planifiés", () => {
    const scheduled = block("b1", [], {
      exercises: [exercise("a", { origin: { kind: CompositionOrigin.ADDED } })],
    });
    expect(issuesOf(scheduledSessionBlocksSchema, [scheduled])).toEqual([]);
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
    issuesOf(scheduledSessionBlocksSchema, [block("b1", [], { exercises })]);

  it("est la sienne pour un exercice reçu, celle qu'il remplace pour un remplaçant, aucune pour un ajout", () => {
    expect(referencePlaceOf(received("a"))).toBe("a");
    expect(referencePlaceOf(replacing("a2", "a"))).toBe("a");
    expect(referencePlaceOf(added("a"))).toBeNull();
  });

  it("n'est occupée qu'une fois : ni un exercice et son remplaçant, ni deux remplaçants", () => {
    const twice = ": Un exercice de la séance-type ne peut être gardé ou remplacé qu'une fois.";
    expect(parse(received("a"), replacing("b2", "b"), added("c"), added("d"))).toEqual([]);
    expect(parse(received("a"), replacing("a2", "a"))).toEqual([twice]);
    expect(parse(replacing("a2", "a"), replacing("a3", "a"))).toEqual([twice]);
  });
});
