import { type RichBlock, RichBlockType, type RichDocument } from "@cmv/shared";
import { describe, expect, it } from "vitest";
import type { PendingImage } from "@/feature/library/hook/useInstructionMedia";
import { citedPendingImages, withResolvedImages } from "./instruction-media.util";

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

const waiting = (mediaId: string): PendingImage => ({
  mediaId,
  file: new File(["x"], `${mediaId}.png`, { type: "image/png" }),
  mimeType: "image/png",
  objectUrl: `blob:${mediaId}`,
});

describe("citedPendingImages", () => {
  it("garde l'image en attente que la consigne cite", () => {
    const cited = waiting("pending:abc");
    expect(citedPendingImages(document, [cited])).toEqual([cited]);
  });

  // Posée puis retirée (#330) : envoyée, elle serait rattachée sans que rien ne l'affiche.
  it("écarte l'image retirée de la consigne depuis qu'elle a été posée", () => {
    expect(citedPendingImages(document, [waiting("pending:retiree")])).toEqual([]);
  });

  it("n'a rien à envoyer pour une consigne sans image en attente", () => {
    expect(citedPendingImages([paragraph, savedImage], [waiting("pending:abc")])).toEqual([]);
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
