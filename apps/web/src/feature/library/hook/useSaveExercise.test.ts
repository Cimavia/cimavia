import { ApiError, type ExerciseDto, type RichBlock, RichBlockType } from "@cmv/shared";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadToSignedUrl } from "@/shared/lib/upload";
import { renderWithQueryClient } from "../../../../test/query";
import { AttachmentFailedError, type PendingFile, useSaveExercise } from "./useSaveExercise";

const api = vi.hoisted(() => ({
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  requestUploadUrl: vi.fn(),
  attachDocument: vi.fn(),
}));

vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  ...api,
}));

vi.mock("@/shared/lib/upload", () => ({ uploadToSignedUrl: vi.fn() }));

const SAVED = { id: "ex-1", updatedAt: "2026-10-19T10:00:00.000Z" } as ExerciseDto;

const pendingPdf: PendingFile = {
  id: "pf-1",
  file: new File(["x"], "programme.pdf", { type: "application/pdf" }),
  mimeType: "application/pdf",
};

const PENDING_IMAGE = "pending:img-1";
const image = (mediaId: string): RichBlock => ({ type: RichBlockType.IMAGE, mediaId });
const pendingImage = {
  mediaId: PENDING_IMAGE,
  file: new File(["x"], "position.png", { type: "image/png" }),
  mimeType: "image/png" as const,
  objectUrl: "blob:fake",
};

const STORAGE_REFUSED = new ApiError(502, "Le storage n'a pas pu confirmer la réception", null);

function setup() {
  const { wrapper } = renderWithQueryClient();
  return renderHook(() => useSaveExercise(), { wrapper }).result;
}

/** L'erreur que rend l'enregistrement, ou l'échec du test s'il passe. */
async function failureOf(
  result: ReturnType<typeof setup>,
  args: Parameters<ReturnType<typeof useSaveExercise>["save"]>[0],
): Promise<unknown> {
  let failure: unknown = null;
  await act(async () => {
    failure = await result.current.save(args).then(
      () => expect.fail("l'enregistrement devait échouer"),
      (error: unknown) => error,
    );
  });
  return failure;
}

const creation = { exercise: null, input: { title: "Gainage" }, pendingLinks: [] };

beforeEach(() => {
  vi.clearAllMocks();
  api.createExercise.mockResolvedValue(SAVED);
  api.updateExercise.mockResolvedValue(SAVED);
  api.requestUploadUrl.mockResolvedValue({ uploadUrl: "https://s3.test/put", storagePath: "k" });
  api.attachDocument.mockResolvedValue({ id: "doc-1" });
  vi.mocked(uploadToSignedUrl).mockResolvedValue(undefined);
});

/**
 * Un fichier qui ne se joint pas tombe APRÈS l'écriture de l'exercice : le Coach doit savoir
 * lequel, et que le reste est enregistré. Sans quoi il lisait le « Internal server error » brut
 * de l'API, sans savoir s'il avait perdu sa saisie (#649).
 */
describe("useSaveExercise — un fichier qui ne se joint pas", () => {
  it("nomme la pièce jointe que le storage refuse, et garde la cause", async () => {
    api.attachDocument.mockRejectedValueOnce(STORAGE_REFUSED);
    const onExerciseSaved = vi.fn();
    const onFileAttached = vi.fn();

    const failure = await failureOf(setup(), {
      ...creation,
      pendingFiles: [pendingPdf],
      onExerciseSaved,
      onFileAttached,
    });

    expect(failure).toBeInstanceOf(AttachmentFailedError);
    expect(failure).toMatchObject({ fileName: "programme.pdf", cause: STORAGE_REFUSED });
    // L'exercice, lui, est passé : c'est ce qui rend le message vrai.
    expect(onExerciseSaved).toHaveBeenCalledWith(SAVED);
    expect(onFileAttached).not.toHaveBeenCalled();
  });

  it("nomme la pièce jointe dont l'envoi au storage échoue", async () => {
    vi.mocked(uploadToSignedUrl).mockRejectedValueOnce(new Error("réseau"));

    const failure = await failureOf(setup(), { ...creation, pendingFiles: [pendingPdf] });

    expect(failure).toMatchObject({ fileName: "programme.pdf" });
    expect(api.attachDocument).not.toHaveBeenCalled();
  });

  it("nomme l'image de consigne qui ne se joint pas", async () => {
    api.attachDocument.mockRejectedValueOnce(STORAGE_REFUSED);

    const failure = await failureOf(setup(), {
      ...creation,
      input: { title: "Gainage", instructions: [image(PENDING_IMAGE)] },
      pendingFiles: [],
      pendingImages: [pendingImage],
    });

    expect(failure).toMatchObject({ fileName: "position.png", cause: STORAGE_REFUSED });
  });

  it("nomme le lien qui ne se joint pas", async () => {
    api.attachDocument.mockRejectedValueOnce(new ApiError(503, "indisponible", null));

    const failure = await failureOf(setup(), {
      ...creation,
      pendingFiles: [],
      pendingLinks: ["https://youtu.be/demo"],
    });

    expect(failure).toMatchObject({ fileName: "https://youtu.be/demo" });
  });

  // Rien n'est enregistré : dire le contraire mentirait. L'écran garde son message générique.
  it("laisse l'erreur telle quelle quand l'exercice lui-même ne s'enregistre pas", async () => {
    api.createExercise.mockRejectedValueOnce(STORAGE_REFUSED);

    const failure = await failureOf(setup(), { ...creation, pendingFiles: [pendingPdf] });

    expect(failure).toBe(STORAGE_REFUSED);
  });

  // La session perdue a sa propre fenêtre (#336) : le formulaire n'a rien à en dire.
  it("laisse passer une session perdue sans la prendre pour un fichier refusé", async () => {
    const unauthorized = new ApiError(401, "Unauthorized", null);
    api.attachDocument.mockRejectedValueOnce(unauthorized);

    const failure = await failureOf(setup(), { ...creation, pendingFiles: [pendingPdf] });

    expect(failure).toBe(unauthorized);
  });
});
