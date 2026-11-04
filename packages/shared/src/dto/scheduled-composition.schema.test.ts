import { describe, expect, it } from "vitest";
import { CLIENT_KEY_MAX_LENGTH } from "./client-key.schema";
import { CompositionEditKind, compositionEditSchema } from "./scheduled-composition.schema";

const tooLong = "k".repeat(CLIENT_KEY_MAX_LENGTH + 1);
const accepts = (edit: object) => compositionEditSchema.safeParse(edit).success;

// La clé tirée par le client s'écrit, celle d'un exercice stocké n'est que cherchée (#354).
describe("compositionEditSchema", () => {
  it("borne la clé écrite d'un ajout et d'un remplaçant", () => {
    const add = { kind: CompositionEditKind.ADD, blockIndex: 0, exerciseId: "exercise_1" };
    expect(accepts({ ...add, key: "k".repeat(CLIENT_KEY_MAX_LENGTH) })).toBe(true);
    expect(accepts({ ...add, key: tooLong })).toBe(false);
    const replace = { ...add, kind: CompositionEditKind.REPLACE, replacesKey: "a" };
    expect(accepts({ ...replace, key: tooLong })).toBe(false);
  });

  it("retire ou remplace un exercice stocké avant la borne", () => {
    expect(accepts({ kind: CompositionEditKind.REMOVE, blockIndex: 0, key: tooLong })).toBe(true);
    const replace = {
      kind: CompositionEditKind.REPLACE,
      blockIndex: 0,
      key: "b",
      exerciseId: "exercise_1",
    };
    expect(accepts({ ...replace, replacesKey: tooLong })).toBe(true);
  });
});
