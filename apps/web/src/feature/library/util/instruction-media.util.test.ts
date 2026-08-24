import { type RichBlock, RichBlockType, type RichDocument } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import {
  hasPendingImages,
  withoutPendingImages,
  withResolvedImages,
} from "./instruction-media.util";

const paragraph: RichBlock = {
  type: RichBlockType.PARAGRAPH,
  content: [{ text: "Coudes serrés." }],
};
const pendingImage: RichBlock = { type: RichBlockType.IMAGE, mediaId: "pending:abc" };
const savedImage: RichBlock = {
  type: RichBlockType.IMAGE,
  mediaId: "doc_1",
  caption: "Position basse",
};

const document: RichDocument = [paragraph, pendingImage, savedImage];

describe("withoutPendingImages", () => {
  it("retire les images en attente, garde le reste", () => {
    expect(withoutPendingImages(document)).toEqual([paragraph, savedImage]);
  });
});

describe("hasPendingImages", () => {
  it("distingue un document qui attend un envoi d'un document déjà complet", () => {
    expect(hasPendingImages(document)).toBe(true);
    expect(hasPendingImages([paragraph, savedImage])).toBe(false);
  });
});

describe("withResolvedImages", () => {
  it("réécrit l'id provisoire en id définitif, sans toucher aux autres blocs", () => {
    const resolved = withResolvedImages(document, new Map([["pending:abc", "doc_2"]]));
    expect(resolved).toEqual([paragraph, { ...pendingImage, mediaId: "doc_2" }, savedImage]);
  });

  it("retire l'image dont l'envoi n'a rien rendu, plutôt que de laisser une référence morte", () => {
    // Une consigne qui pointe vers un média inexistant afficherait un trou que rien ne répare.
    expect(withResolvedImages(document, new Map())).toEqual([paragraph, savedImage]);
  });
});
