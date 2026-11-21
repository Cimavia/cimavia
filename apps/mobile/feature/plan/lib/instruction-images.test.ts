import {
  DocumentType,
  DocumentUsage,
  type ExerciseDocumentDto,
  RichBlockType,
  type RichDocument,
} from "@cmv/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Le disque est piloté par test : c'est la présence du fichier qui décide de la source. */
const localDocumentUri = vi.fn<(planId: string, document: ExerciseDocumentDto) => string | null>(
  () => null,
);
vi.mock("@/shared/lib/document-cache", () => ({
  localDocumentUri: (planId: string, document: ExerciseDocumentDto) =>
    localDocumentUri(planId, document),
}));

const { instructionImageResolver } = await import("./instruction-images");

function document(over: Partial<ExerciseDocumentDto> = {}): ExerciseDocumentDto {
  return {
    id: "media-1",
    type: DocumentType.FILE,
    usage: DocumentUsage.INSTRUCTION,
    url: "https://storage.test/instruction.png",
    fileName: "prise.png",
    mimeType: "image/png",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const LOCAL_URI = "file:///documents/plan-documents/plan-1/media-1.png";

beforeEach(() => {
  localDocumentUri.mockReset();
  localDocumentUri.mockReturnValue(null);
});

/** Une consigne qui cite ces images, entre deux paragraphes pour qu'elles ne soient pas seules. */
function citing(...mediaIds: string[]): RichDocument {
  return [
    { type: RichBlockType.PARAGRAPH, content: [{ text: "Mise en place." }] },
    ...mediaIds.map((mediaId) => ({ type: RichBlockType.IMAGE, mediaId, caption: null })),
  ];
}

describe("instructionImageResolver", () => {
  /**
   * Tout l'objet de #95 : l'image lue depuis le disque ne périme pas et ne demande aucun réseau.
   * Elle passe donc devant l'URL signée même EN LIGNE — l'aller-retour au storage n'apporterait
   * rien de plus qu'une latence.
   */
  it("préfère le fichier local à l'url signée, cherché dans le magasin du cycle", () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);
    const instruction = document();

    const resolve = instructionImageResolver("plan-1", citing("media-1"), [instruction]);

    expect(resolve("media-1")).toBe(LOCAL_URI);
    expect(localDocumentUri).toHaveBeenCalledWith("plan-1", instruction);
  });

  it("retombe sur l'url signée tant que le fichier n'est pas descendu", () => {
    const resolve = instructionImageResolver("plan-1", citing("media-1"), [document()]);

    expect(resolve("media-1")).toBe("https://storage.test/instruction.png");
  });

  /** Média introuvable : `null`, que la consigne rend comme une absence — pas de cadre cassé. */
  it("rend null pour un média cité mais absent des documents", () => {
    const resolve = instructionImageResolver("plan-1", citing("media-inconnu"), [document()]);

    expect(resolve("media-inconnu")).toBeNull();
  });

  /** Une pièce jointe se tape sous la consigne ; elle n'a pas à surgir au milieu du texte. */
  it("ne résout pas une pièce jointe, même image, même identifiant", () => {
    localDocumentUri.mockReturnValue(LOCAL_URI);

    const resolve = instructionImageResolver("plan-1", citing("media-1"), [
      document({ usage: DocumentUsage.ATTACHMENT }),
    ]);

    expect(resolve("media-1")).toBeNull();
    expect(localDocumentUri).not.toHaveBeenCalled();
  });

  /** Un document que la consigne ne cite pas n'a rien à faire lire sur le disque. */
  it("ne lit sur le disque que les images que la consigne cite", () => {
    instructionImageResolver("plan-1", citing("media-2"), [
      document(),
      document({ id: "media-2" }),
    ]);

    expect(localDocumentUri).toHaveBeenCalledTimes(1);
    expect(localDocumentUri.mock.calls[0]?.[1]).toMatchObject({ id: "media-2" });
  });

  it("ne lit rien sans consigne", () => {
    const resolve = instructionImageResolver("plan-1", null, [document()]);

    expect(resolve("media-1")).toBeNull();
    expect(localDocumentUri).not.toHaveBeenCalled();
  });

  /** Le disque est lu à la construction, pas à chaque rendu de l'image. */
  it("interroge le disque une fois par image, quel que soit le nombre de lectures", () => {
    const resolve = instructionImageResolver("plan-1", citing("media-1"), [document()]);

    resolve("media-1");
    resolve("media-1");

    expect(localDocumentUri).toHaveBeenCalledTimes(1);
  });
});
