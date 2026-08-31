import { describe, expect, it } from "vitest";
import {
  attachDocumentSchema,
  createExerciseSchema,
  DocumentType,
  DocumentUsage,
  EXERCISE_MAX_TAGS,
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
  const base = { title: "Tractions lestées" };

  it("accepte un exercice sans tags — le champ est facultatif", () => {
    expect(createExerciseSchema.parse(base).tags).toBeUndefined();
  });

  it("normalise les tags fournis", () => {
    expect(createExerciseSchema.parse({ ...base, tags: ["Force"] }).tags).toEqual(["force"]);
  });

  it("refuse un champ inconnu (schéma strict)", () => {
    expect(createExerciseSchema.safeParse({ ...base, cotation: "6b" }).success).toBe(false);
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

describe("consigne structurée et blocs", () => {
  const base = { title: "Tractions lestées" };
  const paragraph = [{ type: "PARAGRAPH", content: [{ text: "Coudes serrés." }] }];

  it("accepte un exercice sans consigne ni bloc", () => {
    const parsed = createExerciseSchema.parse(base);
    expect(parsed.instructions).toBeUndefined();
    expect(parsed.blocks).toBeUndefined();
  });

  it("accepte une consigne structurée", () => {
    expect(createExerciseSchema.parse({ ...base, instructions: paragraph }).instructions).toEqual(
      paragraph,
    );
  });

  it("refuse une consigne dont un lien n'est pas en http(s)", () => {
    const hostile = [
      { type: "PARAGRAPH", content: [{ text: "ici", href: "javascript:alert(1)" }] },
    ];
    expect(createExerciseSchema.safeParse({ ...base, instructions: hostile }).success).toBe(false);
  });

  it("distingue « consigne absente » de « consigne effacée »", () => {
    // undefined : ne touche pas. null : efface. Le service s'appuie sur cette différence.
    expect(updateExerciseSchema.parse({ title: "x" }).instructions).toBeUndefined();
    expect(updateExerciseSchema.parse({ instructions: null }).instructions).toBeNull();
  });
});

describe("attachDocumentSchema", () => {
  const file = {
    type: DocumentType.FILE,
    storagePath: "coach/ex/1.jpg",
    fileName: "1.jpg",
  };

  it("traite un document sans usage comme une pièce jointe", () => {
    const parsed = attachDocumentSchema.parse({ ...file, mimeType: "application/pdf" });
    // `undefined` et non ATTACHMENT : c'est le service qui pose le défaut, le schéma n'invente pas
    // une intention que l'appelant n'a pas exprimée.
    expect(parsed).not.toHaveProperty("usage", DocumentUsage.ATTACHMENT);
  });

  it("accepte une image comme consigne", () => {
    const parsed = attachDocumentSchema.parse({
      ...file,
      mimeType: "image/jpeg",
      usage: DocumentUsage.INSTRUCTION,
    });
    expect(parsed).toMatchObject({ usage: DocumentUsage.INSTRUCTION });
  });

  it("refuse un PDF comme consigne, mais l'accepte en pièce jointe", () => {
    const asInstruction = {
      ...file,
      mimeType: "application/pdf",
      usage: DocumentUsage.INSTRUCTION,
    };
    expect(attachDocumentSchema.safeParse(asInstruction).success).toBe(false);

    const asAttachment = { ...file, mimeType: "application/pdf", usage: DocumentUsage.ATTACHMENT };
    expect(attachDocumentSchema.safeParse(asAttachment).success).toBe(true);
  });
});
