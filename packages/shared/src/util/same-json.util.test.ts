import { describe, expect, it } from "vitest";
import { sameJson } from "./same-json.util";

describe("sameJson", () => {
  it("compare des scalaires", () => {
    expect(sameJson("a", "a")).toBe(true);
    expect(sameJson(1, 1)).toBe(true);
    expect(sameJson(null, null)).toBe(true);
    expect(sameJson(1, "1")).toBe(false);
    expect(sameJson(0, null)).toBe(false);
  });

  // Une saisie rangée dans un autre ordre que la relecture n'est pas une modification.
  it("ignore l'ORDRE des clés, à toute profondeur", () => {
    expect(sameJson({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  // L'ordre d'un tableau, lui, est une donnée : deux exercices permutés font une autre séance.
  it("tient compte de l'ordre d'un tableau", () => {
    expect(sameJson([1, 2], [1, 2])).toBe(true);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson([1], [1, 1])).toBe(false);
  });

  // `JSON.stringify` tait une clé à `undefined` : elle n'envoie rien de plus qu'une clé absente.
  it("traite une clé à undefined comme absente", () => {
    expect(sameJson({ id: undefined, a: 1 }, { a: 1 })).toBe(true);
  });

  // Une clé à `null` part sur le fil : ce n'est pas une absence.
  it("distingue null d'une clé absente", () => {
    expect(sameJson({ a: null }, {})).toBe(false);
  });

  it("distingue un objet d'un tableau", () => {
    expect(sameJson({}, [])).toBe(false);
  });

  // Clé écrite nue, `{"a:1": "x"}` et `{a: "1:x"}`… se ressemblaient : la clé est échappée.
  it("ne confond pas une clé contenant un séparateur avec une valeur", () => {
    expect(sameJson({ "a:1": 2 }, { a: "1:2" })).toBe(false);
  });
});
