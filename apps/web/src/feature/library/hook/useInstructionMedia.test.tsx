import type { ExerciseDocumentDto } from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPendingMediaId, useInstructionMedia } from "./useInstructionMedia";

const saved = [
  { id: "doc_1", url: "https://stockage.example/signed/doc_1" },
] as unknown as ExerciseDocumentDto[];

const photo = (name: string) => new File(["x"], name, { type: "image/png" });

let blobs = 0;
const createObjectURL = vi.fn(() => `blob:local-${++blobs}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  blobs = 0;
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  vi.clearAllMocks();
});

function setup(documents: readonly ExerciseDocumentDto[] = saved) {
  return renderHook(() => useInstructionMedia(documents));
}

describe("useInstructionMedia", () => {
  it("rend un id provisoire à l'image posée, et la compte en attente", () => {
    const { result } = setup();

    let mediaId = "";
    act(() => {
      mediaId = result.current.register(photo("prise.png"), "image/png");
    });

    expect(isPendingMediaId(mediaId)).toBe(true);
    expect(result.current.pending).toEqual([
      expect.objectContaining({ mediaId, mimeType: "image/png" }),
    ]);
  });

  // Deux images du même fichier restent deux images : chacune a son id.
  it("donne un id propre à chaque image, même du même fichier", () => {
    const { result } = setup();
    const file = photo("prise.png");

    act(() => {
      result.current.register(file, "image/png");
      result.current.register(file, "image/png");
    });

    const [first, second] = result.current.pending;
    expect(first?.mediaId).not.toBe(second?.mediaId);
  });

  it("affiche une image posée depuis le poste, une image enregistrée depuis le stockage", () => {
    const { result } = setup();

    let mediaId = "";
    act(() => {
      mediaId = result.current.register(photo("prise.png"), "image/png");
    });

    expect(result.current.resolve(mediaId)).toBe("blob:local-1");
    expect(result.current.resolve("doc_1")).toBe("https://stockage.example/signed/doc_1");
  });

  // Un id inconnu ne s'invente pas d'image : `null`, et c'est la vue qui dit « image manquante ».
  it("ne résout pas un id inconnu", () => {
    expect(setup().result.current.resolve("doc_perdu")).toBeNull();
  });

  // #302 : une image envoyée ne repart pas au réessai, mais l'éditeur porte encore son id
  // provisoire — le magasin doit toujours savoir l'afficher.
  it("sort de l'attente une image envoyée, sans oublier comment l'afficher", () => {
    const { result } = setup();

    let mediaId = "";
    act(() => {
      mediaId = result.current.register(photo("prise.png"), "image/png");
    });
    act(() => result.current.markSent(mediaId, "doc_9"));

    expect(result.current.pending).toEqual([]);
    expect(result.current.sent.get(mediaId)).toBe("doc_9");
    expect(result.current.resolve(mediaId)).toBe("blob:local-1");
  });

  it("suit la progression de chaque image, séparément", () => {
    const { result } = setup();

    act(() => {
      result.current.setProgress("pending:a", 40);
      result.current.setProgress("pending:b", 10);
    });
    act(() => result.current.setProgress("pending:a", 80));

    expect(result.current.progress).toEqual({ "pending:a": 80, "pending:b": 10 });
  });

  // Sans révocation, chaque image posée fuit tant que l'onglet vit.
  it("libère au démontage toutes les images posées, y compris les dernières", () => {
    const { result, unmount } = setup();

    act(() => {
      result.current.register(photo("a.png"), "image/png");
    });
    act(() => {
      result.current.register(photo("b.png"), "image/png");
    });
    expect(revokeObjectURL).not.toHaveBeenCalled();
    unmount();

    expect(revokeObjectURL.mock.calls.map(([url]) => url)).toEqual([
      "blob:local-1",
      "blob:local-2",
    ]);
  });
});

describe("isPendingMediaId", () => {
  it("reconnaît un id provisoire, et lui seul", () => {
    expect(isPendingMediaId("pending:abc")).toBe(true);
    expect(isPendingMediaId("cm1abcdef")).toBe(false);
  });
});
