import {
  DocumentType,
  DocumentUsage,
  type RichBlock,
  RichBlockType,
  type RichDocument,
} from "@cmv/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  assertInstructionImagesOwned,
  instructionImageIds,
  uncitedInstructionImages,
  withCopiedImages,
  withoutUncitedImages,
} from "./instruction-images.util";

const paragraph: RichBlock = {
  type: RichBlockType.PARAGRAPH,
  content: [{ text: "Coudes serrés." }],
};
const image = (mediaId: string): RichBlock => ({
  type: RichBlockType.IMAGE,
  mediaId,
  width: "MEDIUM",
});

describe("instructionImageIds", () => {
  it("ne retient que les fichiers d'usage consigne", () => {
    const ids = instructionImageIds([
      { id: "consigne", type: DocumentType.FILE, usage: DocumentUsage.INSTRUCTION },
      { id: "piece-jointe", type: DocumentType.FILE, usage: DocumentUsage.ATTACHMENT },
      { id: "lien", type: DocumentType.LINK, usage: DocumentUsage.ATTACHMENT },
    ]);
    expect([...ids]).toEqual(["consigne"]);
  });
});

describe("uncitedInstructionImages", () => {
  const kept = { id: "gardee", type: DocumentType.FILE, usage: DocumentUsage.INSTRUCTION };
  const replaced = { id: "remplacee", type: DocumentType.FILE, usage: DocumentUsage.INSTRUCTION };
  const attachment = {
    id: "piece-jointe",
    type: DocumentType.FILE,
    usage: DocumentUsage.ATTACHMENT,
  };
  const link = { id: "lien", type: DocumentType.LINK, usage: DocumentUsage.ATTACHMENT };
  const documents = [kept, replaced, attachment, link];

  it("rend l'image que la consigne ne cite plus, pas celle qu'elle garde", () => {
    expect(uncitedInstructionImages([paragraph, image("gardee")], documents)).toEqual([replaced]);
  });

  it("rend toutes les images d'une consigne effacée, et aucune pièce jointe ni lien", () => {
    expect(uncitedInstructionImages(null, documents)).toEqual([kept, replaced]);
  });

  it("ne rend rien quand la consigne cite toutes ses images", () => {
    expect(uncitedInstructionImages([image("remplacee"), image("gardee")], documents)).toEqual([]);
  });
});

describe("withoutUncitedImages", () => {
  const cited = { id: "citee", type: DocumentType.FILE, usage: DocumentUsage.INSTRUCTION };
  const orphan = { id: "orpheline", type: DocumentType.FILE, usage: DocumentUsage.INSTRUCTION };
  const attachment = {
    id: "piece-jointe",
    type: DocumentType.FILE,
    usage: DocumentUsage.ATTACHMENT,
  };

  it("reprend pièces jointes et images citées, pas l'image orpheline, dans l'ordre", () => {
    expect(withoutUncitedImages([image("citee")], [attachment, orphan, cited])).toEqual([
      attachment,
      cited,
    ]);
  });

  it("ne reprend aucune image d'une ligne sans consigne", () => {
    expect(withoutUncitedImages(null, [orphan, attachment])).toEqual([attachment]);
  });
});

describe("assertInstructionImagesOwned", () => {
  const documents = [
    { id: "consigne", type: DocumentType.FILE, usage: DocumentUsage.INSTRUCTION },
    { id: "piece-jointe", type: DocumentType.FILE, usage: DocumentUsage.ATTACHMENT },
  ];

  it.each([
    ["une consigne inchangée", undefined],
    ["une consigne effacée", null],
    ["une consigne sans image", [paragraph]],
    ["une image de la ligne", [paragraph, image("consigne")]],
  ])("laisse passer %s", (_label, instructions) => {
    expect(() => assertInstructionImagesOwned(instructions, documents)).not.toThrow();
  });

  it.each([
    ["le document d'une autre ligne", "ailleurs"],
    ["une pièce jointe de la ligne", "piece-jointe"],
  ])("refuse %s (400)", (_label, mediaId) => {
    expect(() => assertInstructionImagesOwned([image(mediaId)], documents)).toThrow(
      BadRequestException,
    );
  });

  it("refuse toute image quand la ligne n'a encore aucun document", () => {
    expect(() => assertInstructionImagesOwned([image("consigne")], [])).toThrow(
      BadRequestException,
    );
  });
});

describe("withCopiedImages", () => {
  it("réécrit chaque image vers son document recopié, réglages compris", () => {
    const copied = withCopiedImages([paragraph, image("source")], new Map([["source", "copie"]]));
    expect(copied).toEqual([paragraph, image("copie")]);
  });

  it("retire l'image dont le document n'a pas été recopié", () => {
    const copied = withCopiedImages([paragraph, image("ailleurs")], new Map());
    expect(copied).toEqual([paragraph]);
  });

  it("rend null quand il ne reste rien, jamais une consigne vide", () => {
    const instructions: RichDocument = [image("ailleurs")];
    expect(withCopiedImages(instructions, new Map())).toBeNull();
  });
});
