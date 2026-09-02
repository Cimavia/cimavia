import { MAX_MESSAGE_MEDIA_BATCH, MessageType, UploadMode } from "@cmv/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ImagePickerAsset } from "expo-image-picker";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSendMessageMedia } from "./useMessageMedia";

const {
  requestUrlMock,
  sendMessageMock,
  completeMock,
  abortMock,
  prepareAssetMock,
  prepareAudioMock,
  uploadFileMock,
  uploadPartsMock,
  permissionMock,
  launchLibraryMock,
} = vi.hoisted(() => ({
  requestUrlMock: vi.fn(),
  sendMessageMock: vi.fn(),
  completeMock: vi.fn(),
  abortMock: vi.fn(),
  prepareAssetMock: vi.fn(),
  prepareAudioMock: vi.fn(),
  uploadFileMock: vi.fn(),
  uploadPartsMock: vi.fn(),
  permissionMock: vi.fn(),
  launchLibraryMock: vi.fn(),
}));

/**
 * Tout ce qui mène à un module NATIF est coupé sans `importOriginal` : le harnais mobile n'a pas
 * de transformeur Expo, et charger le vrai module casse à l'import (« Tranché en #59 »). Les clés
 * de cache restent les vraies — les inventer ferait vérifier une clé choisie par le test.
 */
vi.mock("@/feature/message/api", async () => ({
  messageApi: {
    requestUploadUrl: requestUrlMock,
    sendMessage: sendMessageMock,
    completeMediaUpload: completeMock,
    abortMediaUpload: abortMock,
  },
  messageKeys: (await import("@cmv/shared")).messageKeys,
}));

vi.mock("@/feature/message/util/media.util", () => ({
  MediaRejectedError: class extends Error {
    constructor(
      readonly reasonKey: string,
      readonly params: Record<string, string | number> = {},
    ) {
      super(reasonKey);
    }
  },
  prepareAsset: prepareAssetMock,
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

vi.mock("@/shared/hook/useExercisedCapability", () => ({ useExercisedCapability: () => null }));

vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: permissionMock,
  launchImageLibraryAsync: launchLibraryMock,
}));

const CONVERSATION_ID = "cv-1";

const asset = (fileName: string | null, type = "image") =>
  ({ fileName, type, uri: `file://${fileName}` }) as ImagePickerAsset;

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const setup = () => renderHook(() => useSendMessageMedia(CONVERSATION_ID), { wrapper });

/** Le refus de SÉLECTION, qui précède tout envoi et n'a donc pas de ligne de récapitulatif. */
const onPickError = vi.fn();

beforeEach(() => {
  onPickError.mockClear();
  prepareAssetMock.mockImplementation((item: ImagePickerAsset) =>
    Promise.resolve({
      type: MessageType.IMAGE,
      uri: item.uri,
      fileName: item.fileName ?? "sans-nom.jpg",
      mimeType: "image/jpeg",
      size: 1_000,
    }),
  );
  requestUrlMock.mockResolvedValue({
    mode: UploadMode.SINGLE,
    uploadUrl: "https://signed",
    storagePath: "k/1",
  });
  sendMessageMock.mockResolvedValue({ id: "msg-1" });
  uploadFileMock.mockResolvedValue(undefined);
  permissionMock.mockResolvedValue({ granted: true });
});

describe("useSendMessageMedia", () => {
  it("envoie un message par média, dans l'ordre de la sélection", async () => {
    launchLibraryMock.mockResolvedValue({
      canceled: false,
      assets: [asset("a.jpg"), asset("b.jpg")],
    });
    const { result } = setup();

    await act(() => result.current.pickAndSend(onPickError));

    // Chaque média EST un message : deux fichiers font deux messages, pas un message à deux
    // pièces jointes.
    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(uploadFileMock).toHaveBeenCalledTimes(2);
  });

  it("ouvre la galerie sur une sélection multiple, bornée au plafond du lot", async () => {
    launchLibraryMock.mockResolvedValue({ canceled: false, assets: [] });
    const { result } = setup();

    await act(() => result.current.pickAndSend(onPickError));

    expect(launchLibraryMock.mock.calls[0]?.[0]).toMatchObject({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: MAX_MESSAGE_MEDIA_BATCH,
    });
  });

  /**
   * Le fil n'a AUCUN quota — rien ne borne donc naturellement une sélection. Le plafond est une
   * borne d'usage côté client, et le surplus est RÉCAPITULÉ plutôt que perdu en silence.
   */
  it("plafonne le lot et rend une ligne par média laissé de côté", async () => {
    launchLibraryMock.mockResolvedValue({
      canceled: false,
      assets: Array.from({ length: MAX_MESSAGE_MEDIA_BATCH + 2 }, (_unused, index) =>
        asset(`photo-${index}.jpg`),
      ),
    });
    const { result } = setup();

    let recap: Awaited<ReturnType<typeof result.current.pickAndSend>> = [];
    await act(async () => {
      recap = await result.current.pickAndSend(onPickError);
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(MAX_MESSAGE_MEDIA_BATCH);
    expect(recap).toHaveLength(2);
    expect(recap[0]?.fileName).toBe(`photo-${MAX_MESSAGE_MEDIA_BATCH}.jpg`);
  });

  // Un échec au milieu du lot n'emporte pas ce qui suit — c'est LA règle de #156.
  it("poursuit le lot après un échec et nomme le média fautif", async () => {
    launchLibraryMock.mockResolvedValue({
      canceled: false,
      assets: [asset("a.jpg"), asset("b.jpg"), asset("c.jpg")],
    });
    uploadFileMock.mockImplementation((_url: string, uri: string) =>
      uri.includes("b.jpg") ? Promise.reject(new Error("réseau")) : Promise.resolve(),
    );
    const { result } = setup();

    let recap: Awaited<ReturnType<typeof result.current.pickAndSend>> = [];
    await act(async () => {
      recap = await result.current.pickAndSend(onPickError);
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    expect(recap).toHaveLength(1);
    expect(recap[0]?.fileName).toBe("b.jpg");
  });

  /**
   * Le refus de la galerie précède tout envoi : il passe par le rappel d'erreur, pas par un
   * récapitulatif — il n'y a aucun fichier à nommer.
   */
  it("signale à part le refus d'accès à la galerie", async () => {
    permissionMock.mockResolvedValue({ granted: false });
    const { result } = setup();

    let recap: Awaited<ReturnType<typeof result.current.pickAndSend>> = [];
    await act(async () => {
      recap = await result.current.pickAndSend(onPickError);
    });

    expect(onPickError).toHaveBeenCalledWith("messages.media.permission");
    expect(recap).toEqual([]);
    expect(launchLibraryMock).not.toHaveBeenCalled();
  });

  // Annuler n'est PAS une erreur : rien ne part, rien ne s'affiche.
  it("ne dit rien quand la sélection est annulée", async () => {
    launchLibraryMock.mockResolvedValue({ canceled: true });
    const { result } = setup();

    let recap: Awaited<ReturnType<typeof result.current.pickAndSend>> = [];
    await act(async () => {
      recap = await result.current.pickAndSend(onPickError);
    });

    expect(recap).toEqual([]);
    expect(onPickError).not.toHaveBeenCalled();
    expect(requestUrlMock).not.toHaveBeenCalled();
  });

  it("nomme le média en cours d'envoi, puis s'éteint", async () => {
    launchLibraryMock.mockResolvedValue({
      canceled: false,
      assets: [asset("a.jpg"), asset("b.jpg")],
    });
    const release: Array<() => void> = [];
    uploadFileMock.mockImplementation(() => new Promise<void>((r) => release.push(r)));
    const { result } = setup();

    let batchDone: Promise<unknown> = Promise.resolve();
    await act(async () => {
      batchDone = result.current.pickAndSend(onPickError);
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
    await waitFor(() => expect(result.current.step?.index).toBe(2));

    await act(async () => {
      release[1]?.();
      await batchDone;
    });
    expect(result.current.step).toBeNull();
    expect(result.current.isUploading).toBe(false);
  });

  it("envoie une note vocale sans ouvrir la galerie", async () => {
    prepareAudioMock.mockReturnValue({
      type: MessageType.AUDIO,
      uri: "file://note.m4a",
      fileName: "note.m4a",
      mimeType: "audio/m4a",
      size: 500,
      durationSeconds: 9,
    });
    const { result } = setup();

    act(() => result.current.recordAndSend({ uri: "file://note.m4a", durationSeconds: 9 }));

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledOnce());
    expect(launchLibraryMock).not.toHaveBeenCalled();
  });

  it("porte l'échec d'une note vocale à part, là où le lot a son récapitulatif", async () => {
    prepareAudioMock.mockImplementation(() => {
      throw new Error("trop longue");
    });
    const { result } = setup();

    act(() => result.current.recordAndSend({ uri: "file://note.m4a", durationSeconds: 9 }));

    await waitFor(() => expect(result.current.audioError).toBeInstanceOf(Error));
  });
});
