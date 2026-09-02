import type { MediaBatch } from "@cmv/shared";
import { MAX_FEEDBACK_PHOTOS, MAX_FEEDBACK_VIDEOS, MediaType, UploadMode } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ImagePickerAsset } from "expo-image-picker";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickFeedbackAssets, useAddFeedbackAudio, useAddFeedbackMedia } from "./useFeedbackMedia";

const {
  requestUrlMock,
  attachMock,
  completeMock,
  abortMock,
  prepareMediaMock,
  prepareAudioMock,
  uploadFileMock,
  uploadPartsMock,
  permissionMock,
  launchLibraryMock,
} = vi.hoisted(() => ({
  requestUrlMock: vi.fn(),
  attachMock: vi.fn(),
  completeMock: vi.fn(),
  abortMock: vi.fn(),
  prepareMediaMock: vi.fn(),
  prepareAudioMock: vi.fn(),
  uploadFileMock: vi.fn(),
  uploadPartsMock: vi.fn(),
  permissionMock: vi.fn(),
  launchLibraryMock: vi.fn(),
}));

/**
 * Tout ce que le hook importe et qui mène à un module NATIF est coupé — sans `importOriginal`, qui
 * chargerait le vrai module et donc `expo-file-system` / `expo-image-manipulator` : le harnais
 * mobile n'a pas de transformeur Expo, et le vrai module casse à l'import (« Tranché en #59 »).
 *
 * Les clés de cache, elles, restent les VRAIES : les inventer ici ferait vérifier au test une clé
 * qu'il aurait lui-même choisie.
 */
vi.mock("@/feature/feedback/api", async () => ({
  athleteFeedbackApi: {
    requestMediaUploadUrl: requestUrlMock,
    attachMedia: attachMock,
    completeMediaUpload: completeMock,
    abortMediaUpload: abortMock,
    deleteMedia: vi.fn(),
  },
  myFeedbackKeys: (await import("@cmv/shared")).myFeedbackKeys,
}));

vi.mock("@/feature/plan/api", async () => ({
  myPlanKeys: (await import("@cmv/shared")).myPlanKeys,
}));

// `MediaRejectedError` est redéfinie ici et non importée : le hook la prend de CE module, donc les
// `instanceof` du code testé portent bien sur cette classe-là.
vi.mock("@/feature/feedback/util/media.util", () => ({
  MediaRejectedError: class extends Error {
    constructor(
      readonly reasonKey: string,
      readonly params: Record<string, string | number> = {},
    ) {
      super(reasonKey);
    }
  },
  prepareMedia: prepareMediaMock,
  prepareAudio: prepareAudioMock,
}));

vi.mock("@/shared/lib/upload", () => ({
  StorageUploadError: class extends Error {
    constructor(readonly reason: "unreachable" | "rejected") {
      super(reason);
    }
  },
  uploadFileToStorage: uploadFileMock,
  uploadPartsToStorage: uploadPartsMock,
}));

vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: permissionMock,
  launchImageLibraryAsync: launchLibraryMock,
}));

const SESSION_ID = "ss-1";

const asset = (fileName: string | null, type = "image") =>
  ({ fileName, type, uri: `file://${fileName}` }) as ImagePickerAsset;

const prepared = (size: number) => ({
  type: MediaType.IMAGE,
  uri: "file://voie.jpg",
  fileName: "voie.jpg",
  mimeType: "image/jpeg",
  size,
});

const batch = (
  assets: readonly ImagePickerAsset[],
): Omit<MediaBatch<ImagePickerAsset>, "send"> => ({
  items: assets,
  maxItems: MAX_FEEDBACK_PHOTOS + MAX_FEEDBACK_VIDEOS,
  remaining: {
    [MediaType.IMAGE]: MAX_FEEDBACK_PHOTOS,
    [MediaType.VIDEO]: MAX_FEEDBACK_VIDEOS,
    [MediaType.AUDIO]: 0,
  },
  kindOf: () => MediaType.IMAGE,
  nameOf: (item) => item.fileName ?? null,
  rejectedReason: () => ({ key: "refusé", params: {} }),
  failureReason: (error) => ({ message: String(error) }),
});

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  // `retry: false` : sans lui, une mutation en échec est rejouée et le test expire avant de voir
  // l'erreur qu'il vérifie.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  prepareMediaMock.mockResolvedValue(prepared(1_000));
  requestUrlMock.mockResolvedValue({
    mode: UploadMode.SINGLE,
    uploadUrl: "https://signed",
    storagePath: "k/1",
  });
  attachMock.mockResolvedValue({ id: "md-1" });
  uploadFileMock.mockResolvedValue(undefined);
  uploadPartsMock.mockResolvedValue(undefined);
  permissionMock.mockResolvedValue({ granted: true });
  launchLibraryMock.mockResolvedValue({ canceled: false, assets: [asset("a.jpg")] });
});

describe("useAddFeedbackMedia", () => {
  it("signe, téléverse puis rattache chaque média du lot", async () => {
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    await act(() => result.current.addAssets(batch([asset("a.jpg"), asset("b.jpg")])));

    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    expect(uploadFileMock).toHaveBeenCalledTimes(2);
    expect(attachMock).toHaveBeenCalledTimes(2);
  });

  /**
   * Ce que l'écran affiche PENDANT le lot. Les envois sont libérés un par un : lire l'indicateur
   * après coup ne dirait rien de ce que l'athlète a vu.
   */
  it("nomme le média en cours d'envoi, puis s'éteint", async () => {
    const release: Array<() => void> = [];
    uploadFileMock.mockImplementation(() => new Promise<void>((r) => release.push(r)));
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    let batchDone: Promise<unknown> = Promise.resolve();
    await act(async () => {
      batchDone = result.current.addAssets(batch([asset("a.jpg"), asset("b.jpg")]));
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
    expect(result.current.step).toBeNull();
    expect(result.current.isUploading).toBe(false);
  });

  // Le picker ne donne pas toujours de nom : `null` traverse plutôt qu'un libellé inventé ici —
  // c'est au RENDU de choisir quoi montrer (règle nullable).
  it("laisse le nom à null quand le picker n'en donne pas", async () => {
    const release: Array<() => void> = [];
    uploadFileMock.mockImplementation(() => new Promise<void>((r) => release.push(r)));
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    let batchDone: Promise<unknown> = Promise.resolve();
    await act(async () => {
      batchDone = result.current.addAssets(batch([asset(null)]));
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.step?.fileName).toBeNull());
    await act(async () => {
      release[0]?.();
      await batchDone;
    });
  });

  /**
   * La taille est revérifiée APRÈS compression : c'est la taille finale qui est signée dans l'URL,
   * et le storage refuse tout autre poids. Échouer ici coûte une compression ; échouer après,
   * un transfert entier.
   */
  it("refuse un média trop lourd sans demander d'URL", async () => {
    prepareMediaMock.mockResolvedValue(prepared(Number.MAX_SAFE_INTEGER));
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    let recap: Awaited<ReturnType<typeof result.current.addAssets>> = [];
    await act(async () => {
      recap = await result.current.addAssets(batch([asset("enorme.jpg")]));
    });

    expect(requestUrlMock).not.toHaveBeenCalled();
    expect(recap).toHaveLength(1);
  });

  it("découpe l'envoi quand l'API le demande, puis clôt l'upload", async () => {
    requestUrlMock.mockResolvedValue({
      mode: UploadMode.MULTIPART,
      storagePath: "k/1",
      uploadId: "up-1",
      partUrls: ["https://p1", "https://p2"],
      partSize: 8,
    });
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    await act(() => result.current.addAssets(batch([asset("longue.mp4")])));

    expect(uploadFileMock).not.toHaveBeenCalled();
    expect(completeMock).toHaveBeenCalledWith(SESSION_ID, {
      storagePath: "k/1",
      uploadId: "up-1",
      partCount: 2,
    });
  });

  /**
   * Les parts d'un upload jamais clos restent FACTURÉES sans apparaître à l'inventaire du bucket.
   * On paie un envoi à refaire plutôt qu'une fuite invisible.
   */
  it("abandonne l'upload découpé quand une part échoue", async () => {
    requestUrlMock.mockResolvedValue({
      mode: UploadMode.MULTIPART,
      storagePath: "k/1",
      uploadId: "up-1",
      partUrls: ["https://p1"],
      partSize: 8,
    });
    uploadPartsMock.mockRejectedValue(new Error("réseau"));
    abortMock.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAddFeedbackMedia(SESSION_ID), { wrapper });

    await act(() => result.current.addAssets(batch([asset("longue.mp4")])));

    expect(abortMock).toHaveBeenCalledWith(SESSION_ID, { storagePath: "k/1", uploadId: "up-1" });
    expect(completeMock).not.toHaveBeenCalled();
  });
});

describe("useAddFeedbackAudio", () => {
  it("part de l'enregistreur, pas d'un picker, et suit le même flux", async () => {
    prepareAudioMock.mockReturnValue({
      type: MediaType.AUDIO,
      uri: "file://note.m4a",
      fileName: "note.m4a",
      mimeType: "audio/m4a",
      size: 500,
      durationSeconds: 12,
    });
    const { result } = renderHook(() => useAddFeedbackAudio(SESSION_ID), { wrapper });

    act(() => result.current.mutate({ uri: "file://note.m4a", durationSeconds: 12 }));

    await waitFor(() => expect(attachMock).toHaveBeenCalledOnce());
    expect(launchLibraryMock).not.toHaveBeenCalled();
  });
});

describe("pickFeedbackAssets", () => {
  it("ouvre la galerie sur une sélection multiple, photos et vidéos mêlées", async () => {
    await pickFeedbackAssets(8);

    // Un seul geste pour les deux familles : deux pickers séparés imposeraient deux allers-retours
    // pour joindre trois photos et une vidéo, le cas courant après une séance.
    expect(launchLibraryMock.mock.calls[0]?.[0]).toMatchObject({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: 8,
    });
  });

  // La permission est demandée au moment de l'USAGE, pas au lancement de l'app : l'athlète
  // comprend pourquoi on la lui demande.
  it("refuse explicitement quand l'accès à la galerie est refusé", async () => {
    permissionMock.mockResolvedValue({ granted: false });

    await expect(pickFeedbackAssets(8)).rejects.toMatchObject({
      reasonKey: "feedback.media.permission",
    });
    expect(launchLibraryMock).not.toHaveBeenCalled();
  });

  // Annuler n'est PAS une erreur : le lot est simplement vide, et rien ne s'affiche.
  it("rend une sélection vide quand l'athlète annule", async () => {
    launchLibraryMock.mockResolvedValue({ canceled: true });

    expect(await pickFeedbackAssets(8)).toEqual([]);
  });
});
