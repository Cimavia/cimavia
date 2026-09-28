import { DocumentType, type ExerciseDto } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { useExerciseDraft } from "./useExerciseDraft";
import type { PendingFile } from "./useSaveExercise";

const api = vi.hoisted(() => ({
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  getExercise: vi.fn(),
  requestUploadUrl: vi.fn(),
  attachDocument: vi.fn(),
}));

vi.mock("@/feature/library/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/library/api")>()),
  ...api,
}));

vi.mock("@/shared/lib/upload", () => ({ uploadToSignedUrl: vi.fn().mockResolvedValue(undefined) }));

const LINK = "https://example.test/video";

const exercise = (over: Partial<ExerciseDto> = {}) =>
  ({ id: "ex-1", title: "Gainage", instructions: null, documents: [], ...over }) as ExerciseDto;

const pendingPdf: PendingFile = {
  id: "pf-1",
  file: new File(["x"], "gainage.pdf", { type: "application/pdf" }),
  mimeType: "application/pdf",
};

/** Le PDF passe, le lien échoue une fois : l'échec tombe APRÈS l'écriture de l'exercice. */
function linkFailsOnce() {
  api.attachDocument.mockImplementation((_id: string, input: { type: DocumentType }) =>
    Promise.resolve({ id: input.type === DocumentType.FILE ? "doc-pdf" : "doc-link" }),
  );
  api.attachDocument.mockImplementationOnce(() => Promise.resolve({ id: "doc-pdf" }));
  api.attachDocument.mockImplementationOnce(() => Promise.reject(new Error("réseau")));
}

const fileAttachments = () =>
  api.attachDocument.mock.calls.filter(([, input]) => input.type === DocumentType.FILE);

function setup(loaded: ExerciseDto | null) {
  const { queryClient, wrapper } = renderWithQueryClient();
  const view = renderHook(() => useExerciseDraft(loaded, "Gainage"), { wrapper });
  act(() => {
    view.result.current.setPendingFiles([pendingPdf]);
    view.result.current.setPendingLinks([LINK]);
  });
  return { ...view, queryClient };
}

async function submitFails(result: { current: ReturnType<typeof useExerciseDraft> }) {
  await act(async () => {
    await expect(result.current.submit()).rejects.toThrow("réseau");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.createExercise.mockResolvedValue(exercise());
  api.updateExercise.mockResolvedValue(exercise());
  api.getExercise.mockResolvedValue(exercise());
  api.requestUploadUrl.mockResolvedValue({ uploadUrl: "https://s3.test/put", storagePath: "k" });
  linkFailsOnce();
});

describe("useExerciseDraft — un enregistrement interrompu (#302)", () => {
  it("échec à l'étape 2 puis réessai : un seul exercice, une seule pièce jointe", async () => {
    const { result } = setup(null);

    await submitFails(result);
    await act(() => result.current.submit());

    // Le réessai MET À JOUR l'exercice créé au premier essai, il n'en crée pas un second.
    expect(api.createExercise).toHaveBeenCalledTimes(1);
    expect(api.updateExercise).toHaveBeenCalledTimes(1);
    expect(api.updateExercise).toHaveBeenCalledWith("ex-1", expect.anything());
    // Le PDF, passé au premier essai, n'est ni renvoyé ni rattaché une seconde fois.
    expect(api.requestUploadUrl).toHaveBeenCalledTimes(1);
    expect(fileAttachments()).toHaveLength(1);
  });

  it("ne garde en attente que ce qui n'est pas passé", async () => {
    const { result } = setup(null);

    await submitFails(result);

    expect(result.current.pendingFiles).toEqual([]);
    expect(result.current.pendingLinks).toEqual([LINK]);
  });

  it("bascule en édition sur l'exercice créé, relu pour montrer ses documents", async () => {
    const withPdf = exercise({ documents: [{ id: "doc-pdf" } as ExerciseDto["documents"][0]] });
    api.getExercise.mockResolvedValue(withPdf);
    const { result } = setup(null);

    expect(result.current.exercise).toBeNull();
    await submitFails(result);

    // La réponse de création ne porte pas le PDF rattaché ensuite : seule la relecture le montre.
    await waitFor(() => expect(result.current.exercise).toEqual(withPdf));
    expect(api.getExercise).toHaveBeenCalledWith("ex-1");
  });

  it("en édition, le réessai ne rattache pas une seconde fois ce qui est passé", async () => {
    const { result } = setup(exercise());

    await submitFails(result);
    await act(() => result.current.submit());

    expect(api.createExercise).not.toHaveBeenCalled();
    expect(fileAttachments()).toHaveLength(1);
    // Chargé depuis l'URL, l'exercice reste celui de l'écran : pas de seconde lecture.
    expect(api.getExercise).not.toHaveBeenCalled();
  });

  it("rafraîchit la bibliothèque même quand l'enregistrement échoue", async () => {
    const { result, queryClient } = setup(null);
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    await submitFails(result);

    // L'exercice existe déjà : sans ça, il resterait invisible le temps du `staleTime`.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["exercises"] });
  });
});
