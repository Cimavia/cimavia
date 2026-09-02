import type { MediaBatch } from "@cmv/shared";
import { MAX_FEEDBACK_PHOTOS, MAX_FEEDBACK_VIDEOS, MediaType, UploadMode } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { useAddFeedbackMedia, useDeleteFeedbackMedia } from "./useMyFeedbackMedia";

const {
  requestUrlMock,
  attachMock,
  completeMock,
  abortMock,
  deleteMock,
  prepareMock,
  singleUploadMock,
  partsUploadMock,
} = vi.hoisted(() => ({
  requestUrlMock: vi.fn(),
  attachMock: vi.fn(),
  completeMock: vi.fn(),
  abortMock: vi.fn(),
  deleteMock: vi.fn(),
  prepareMock: vi.fn(),
  singleUploadMock: vi.fn(),
  partsUploadMock: vi.fn(),
}));

vi.mock("@/feature/feedback/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/feedback/api")>()),
  athleteFeedbackApi: {
    requestMediaUploadUrl: requestUrlMock,
    attachMedia: attachMock,
    completeMediaUpload: completeMock,
    abortMediaUpload: abortMock,
    deleteMedia: deleteMock,
  },
}));

/**
 * La PRÉPARATION est coupée, pas le reste : elle décode une vidéo dans un `<video>` et redimensionne
 * une image dans un `<canvas>`, deux choses que jsdom ne sait pas faire. Ce qu'on éprouve ici est
 * l'enchaînement qui la suit — signature, transport, rattachement — et le refus de taille, qui
 * porte sur la taille FINALE qu'elle rend.
 */
vi.mock("@/shared/util/media.util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/util/media.util")>()),
  prepareWebMedia: prepareMock,
}));

vi.mock("@/shared/lib/upload", () => ({
  uploadToSignedUrl: singleUploadMock,
  uploadInParts: partsUploadMock,
}));

const SESSION_ID = "ss-1";

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

const prepared = (size: number) => ({
  type: MediaType.IMAGE,
  file: file("voie.jpg"),
  fileName: "voie.jpg",
  mimeType: "image/jpeg",
  size,
});

const singleTicket = { mode: UploadMode.SINGLE, uploadUrl: "https://signed", storagePath: "k/1" };
const partsTicket = {
  mode: UploadMode.MULTIPART,
  storagePath: "k/1",
  uploadId: "up-1",
  partUrls: ["https://p1", "https://p2"],
  partSize: 8,
};

/** Le lot tel que l'écran le compose : c'est lui qui apporte quotas et libellés, pas le hook. */
const batch = (files: readonly File[]): Omit<MediaBatch<File>, "send"> => ({
  items: files,
  maxItems: MAX_FEEDBACK_PHOTOS + MAX_FEEDBACK_VIDEOS,
  remaining: {
    [MediaType.IMAGE]: MAX_FEEDBACK_PHOTOS,
    [MediaType.VIDEO]: MAX_FEEDBACK_VIDEOS,
    [MediaType.AUDIO]: 0,
  },
  kindOf: () => MediaType.IMAGE,
  nameOf: (item) => item.name,
  rejectedReason: () => ({ key: "refusé", params: {} }),
  failureReason: (error) => ({ message: String(error) }),
});

beforeEach(() => {
  vi.clearAllMocks();
  prepareMock.mockResolvedValue(prepared(1_000));
  requestUrlMock.mockResolvedValue(singleTicket);
  attachMock.mockResolvedValue({ id: "md-1" });
  singleUploadMock.mockResolvedValue(undefined);
  partsUploadMock.mockResolvedValue(undefined);
});

describe("useAddFeedbackMedia", () => {
  it("signe, téléverse puis rattache chaque fichier du lot", async () => {
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    await act(() => result.current.addFiles(batch([file("a.jpg"), file("b.jpg")])));

    // Le binaire ne passe JAMAIS par l'API (règle dure n°7) : l'URL signée d'abord, le PUT direct
    // vers le bucket ensuite, et l'API n'apprend l'existence du média qu'au rattachement.
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    expect(singleUploadMock).toHaveBeenCalledTimes(2);
    expect(attachMock).toHaveBeenCalledTimes(2);
    expect(attachMock.mock.calls[0]?.[1]).toMatchObject({ storagePath: "k/1" });
  });

  /**
   * Ce que l'écran affiche PENDANT le lot : le rang doit désigner le fichier en vol, pas celui qui
   * vient de partir. Les envois sont donc libérés un par un, et l'indicateur observé entre les deux
   * — le lire après coup ne dirait rien de ce que l'athlète a vu.
   */
  it("nomme le fichier en cours d'envoi, puis s'éteint", async () => {
    const release: Array<() => void> = [];
    singleUploadMock.mockImplementation(
      () => new Promise<void>((resolve) => release.push(resolve)),
    );
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    let batchDone: Promise<unknown> = Promise.resolve();
    await act(async () => {
      batchDone = result.current.addFiles(batch([file("a.jpg"), file("b.jpg")]));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(result.current.step).toEqual({ index: 1, total: 2, fileName: "a.jpg" }),
    );
    expect(result.current.isUploading).toBe(true);

    await act(async () => {
      release[0]?.();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(result.current.step).toEqual({ index: 2, total: 2, fileName: "b.jpg" }),
    );

    await act(async () => {
      release[1]?.();
      await batchDone;
    });

    // Le lot fini, plus rien n'est « en cours » — sinon l'indicateur resterait allumé.
    expect(result.current.step).toBeNull();
    expect(result.current.isUploading).toBe(false);
  });

  it("rafraîchit le débrief à CHAQUE fichier, pas à la fin du lot", async () => {
    const { wrapper, queryClient } = renderWithQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    await act(() => result.current.addFiles(batch([file("a.jpg"), file("b.jpg")])));

    // Quatre clés invalidées par fichier (débrief, séance, planning, boîte du coach) : la galerie
    // se remplit au fur et à mesure au lieu de rester figée pendant cinq vidéos.
    expect(invalidate).toHaveBeenCalledTimes(8);
  });

  /**
   * La taille est revérifiée APRÈS préparation parce que c'est la taille FINALE qui est signée
   * dans l'URL. Laisser passer, c'est échouer à l'étape la plus chère — celle qui a déjà transféré
   * le fichier.
   */
  it("refuse un fichier trop lourd sans demander d'URL", async () => {
    prepareMock.mockResolvedValue(prepared(Number.MAX_SAFE_INTEGER));
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    let recap: Awaited<ReturnType<typeof result.current.addFiles>> = [];
    await act(async () => {
      recap = await result.current.addFiles(batch([file("enorme.jpg")]));
    });

    expect(requestUrlMock).not.toHaveBeenCalled();
    expect(recap).toHaveLength(1);
  });

  it("découpe l'envoi quand l'API le demande, puis clôt l'upload", async () => {
    requestUrlMock.mockResolvedValue(partsTicket);
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    await act(() => result.current.addFiles(batch([file("longue.mp4")])));

    // C'est l'API qui décide de la forme de l'envoi : le client ne fait qu'obéir au ticket.
    expect(singleUploadMock).not.toHaveBeenCalled();
    expect(partsUploadMock).toHaveBeenCalledOnce();
    expect(completeMock).toHaveBeenCalledWith(SESSION_ID, {
      storagePath: "k/1",
      uploadId: "up-1",
      partCount: 2,
    });
  });

  /**
   * Les parts d'un upload jamais clos restent FACTURÉES sans apparaître à l'inventaire du bucket :
   * personne ne les retrouverait pour les purger. On paie un envoi à refaire plutôt qu'une fuite
   * invisible.
   */
  it("abandonne l'upload découpé quand une part échoue", async () => {
    requestUrlMock.mockResolvedValue(partsTicket);
    partsUploadMock.mockRejectedValue(new Error("réseau"));
    abortMock.mockResolvedValue(undefined);
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    let recap: Awaited<ReturnType<typeof result.current.addFiles>> = [];
    await act(async () => {
      recap = await result.current.addFiles(batch([file("longue.mp4")]));
    });

    expect(abortMock).toHaveBeenCalledWith(SESSION_ID, {
      storagePath: "k/1",
      uploadId: "up-1",
    });
    expect(completeMock).not.toHaveBeenCalled();
    expect(recap).toHaveLength(1);
  });

  it("envoie une note vocale sans passer par un lot", async () => {
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    act(() => result.current.addAudio({ blob: new Blob(["x"]), durationSeconds: 12 }));

    await waitFor(() => expect(attachMock).toHaveBeenCalledOnce());
    expect(prepareMock.mock.calls[0]?.[0]).toMatchObject({ kind: "audio", durationSeconds: 12 });
  });

  it("porte l'échec de la note vocale à part, là où le lot a son récapitulatif", async () => {
    prepareMock.mockRejectedValue(new Error("micro"));
    const { wrapper } = renderWithQueryClient();
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    act(() => result.current.addAudio({ blob: new Blob(["x"]), durationSeconds: 12 }));

    await waitFor(() => expect(result.current.audioError).toBeInstanceOf(Error));
  });
});

describe("useDeleteFeedbackMedia", () => {
  it("retire le média et rafraîchit les vues qui en dépendent", async () => {
    deleteMock.mockResolvedValue(undefined);
    const { wrapper, queryClient } = renderWithQueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteFeedbackMedia(SESSION_ID), { wrapper });

    act(() => result.current.mutate("md-1"));

    // Retirer le dernier média peut faire retomber la séance : le planning doit suivre.
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    expect(deleteMock).toHaveBeenCalledWith(SESSION_ID, "md-1");
  });
});
