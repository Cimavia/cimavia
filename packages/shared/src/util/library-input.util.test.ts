import { describe, expect, it } from "vitest";
import { RichBlockType, type RichDocument } from "../dto/rich-document.schema";
import { toExerciseInput, toSessionInput } from "./library-input.util";

describe("toExerciseInput", () => {
  it("rogne le titre", () => {
    const input = toExerciseInput({
      title: "  Gainage  ",
      tags: [],
      instructions: null,
      blocks: [],
    });
    expect(input.title).toBe("Gainage");
  });

  // « Pas de consigne » est une absence : un document vide part en `null` (règle nullable n°5).
  it("envoie une consigne vide en null", () => {
    expect(
      toExerciseInput({ title: "x", tags: [], instructions: [], blocks: [] }).instructions,
    ).toBeNull();
    expect(
      toExerciseInput({ title: "x", tags: [], instructions: null, blocks: [] }).instructions,
    ).toBeNull();
  });

  it("garde une consigne écrite, les tags et les blocs tels quels", () => {
    const instructions: RichDocument = [
      { type: RichBlockType.PARAGRAPH, content: [{ text: "Dos droit" }] },
    ];
    const input = toExerciseInput({ title: "x", tags: ["core"], instructions, blocks: [] });
    expect(input).toEqual({ title: "x", tags: ["core"], instructions, blocks: [] });
  });
});

describe("toSessionInput", () => {
  const line = { exerciseId: "ex_1", note: "", blocks: [], adjustments: [] };

  it("rogne le titre, et envoie des notes blanches en null", () => {
    const input = toSessionInput({ title: " Jambes ", notes: "   ", exercises: [] });
    expect(input).toEqual({ title: "Jambes", notes: null, exercises: [] });
  });

  it("rogne des notes écrites", () => {
    expect(toSessionInput({ title: "x", notes: " Échauffement ", exercises: [] }).notes).toBe(
      "Échauffement",
    );
  });

  // Saisie (`""`) et relecture (`null`) d'une note jamais écrite partent pareil.
  it("envoie une note de ligne vide ou absente en null", () => {
    const input = toSessionInput({
      title: "x",
      notes: null,
      exercises: [line, { ...line, note: null }, { ...line, note: " Lent " }],
    });
    expect(input.exercises.map((composed) => composed.note)).toEqual([null, null, "Lent"]);
  });

  // L'id d'une ligne enregistrée est ce qui garde sa référence de dosage ; une ligne ajoutée n'en
  // a pas, et la clé ne doit pas partir à `undefined`.
  it("ne porte l'id que sur une ligne déjà enregistrée", () => {
    const input = toSessionInput({
      title: "x",
      notes: null,
      exercises: [{ ...line, id: "se_1" }, line],
    });
    expect(input.exercises[0]).toHaveProperty("id", "se_1");
    expect(input.exercises[1]).not.toHaveProperty("id");
  });

  // Ce que la relecture porte en plus (titre, tags, référence) n'est pas envoyé.
  it("ne garde d'une ligne relue que ce qui s'envoie", () => {
    const relu = { ...line, id: "se_1", title: "Gainage", tags: ["core"], baseline: [] };
    expect(toSessionInput({ title: "x", notes: null, exercises: [relu] }).exercises[0]).toEqual({
      id: "se_1",
      exerciseId: "ex_1",
      note: null,
      blocks: [],
      adjustments: [],
    });
  });
});
