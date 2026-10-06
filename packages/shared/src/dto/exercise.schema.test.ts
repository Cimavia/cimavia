import { describe, expect, it } from "vitest";
import {
  attachDocumentSchema,
  createExerciseSchema,
  DocumentType,
  DocumentUsage,
  duplicateExerciseSchema,
  EXERCISE_MAX_TAGS,
  exerciseTagsSchema,
  isAllowedDocumentMime,
  isInstructionImageMime,
  MAX_DOCUMENT_SIZE_BYTES,
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

describe("duplicateExerciseSchema", () => {
  it("demande un titre, et rien d'autre n'est obligatoire", () => {
    expect(duplicateExerciseSchema.safeParse({ title: "Tractions (variante)" }).success).toBe(true);
    expect(duplicateExerciseSchema.safeParse({}).success).toBe(false);
  });

  // La consigne vient de la SOURCE, côté serveur : l'accepter du client rouvrirait le trou de
  // #315 — une consigne qui cite des images que la variante n'a pas.
  it.each([
    ["la consigne", { instructions: [] }],
    ["les tags", { tags: ["force"] }],
  ])("refuse %s, que le serveur reprend de la source", (_label, extra) => {
    expect(duplicateExerciseSchema.safeParse({ title: "x", ...extra }).success).toBe(false);
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
    size: 2048,
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

  // La taille redit celle du ticket, que l'API confronte à l'objet reçu : sans elle, rien à
  // confronter ; au-delà du plafond, aucun ticket n'a pu être signé.
  it("exige la taille d'un fichier, dans le plafond d'un document", () => {
    const { size: _size, ...withoutSize } = { ...file, mimeType: "application/pdf" };
    expect(attachDocumentSchema.safeParse(withoutSize).success).toBe(false);

    const atCap = { ...file, mimeType: "application/pdf", size: MAX_DOCUMENT_SIZE_BYTES };
    expect(attachDocumentSchema.safeParse(atCap).success).toBe(true);
    expect(attachDocumentSchema.safeParse({ ...atCap, size: atCap.size + 1 }).success).toBe(false);
    expect(attachDocumentSchema.safeParse({ ...atCap, size: 0 }).success).toBe(false);
  });
});

describe("isAllowedDocumentMime", () => {
  it.each(["application/pdf", "image/png", "image/jpeg", "image/webp"])("accepte %s", (mime) => {
    expect(isAllowedDocumentMime(mime)).toBe(true);
  });

  // Un SVG porte du script : servi depuis le bucket, il s'exécuterait au clic.
  it.each(["image/svg+xml", "text/html", "application/zip", ""])("refuse %s", (mime) => {
    expect(isAllowedDocumentMime(mime)).toBe(false);
  });
});

describe("isInstructionImageMime", () => {
  it("accepte une image, pas un PDF — une consigne s'affiche en ligne", () => {
    expect(isInstructionImageMime("image/webp")).toBe(true);
    expect(isInstructionImageMime("application/pdf")).toBe(false);
  });
});
