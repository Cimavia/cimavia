import { MAX_MESSAGE_MEDIA_BATCH, MediaType, UploadMode } from "@cmv/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../../../../test/query";
import { useSendMessageMedia } from "./useSendMessageMedia";

const {
  requestUrlMock,
  sendMessageMock,
  completeMock,
  abortMock,
  prepareMock,
  singleUploadMock,
  partsUploadMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  requestUrlMock: vi.fn(),
  sendMessageMock: vi.fn(),
  completeMock: vi.fn(),
  abortMock: vi.fn(),
  prepareMock: vi.fn(),
  singleUploadMock: vi.fn(),
  partsUploadMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@/feature/message/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/feature/message/api")>()),
  messageApi: {
    requestUploadUrl: requestUrlMock,
    sendMessage: sendMessageMock,
    completeMediaUpload: completeMock,
    abortMediaUpload: abortMock,
  },
}));

// Coupée pour la même raison que côté débrief : elle décode dans un `<video>` et un `<canvas>`,
// hors de portée de jsdom. `MediaRejectedError` et `attachableMediaKind` restent les VRAIS.
vi.mock("@/shared/util/media.util", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/util/media.util")>()),
  prepareWebMedia: prepareMock,
}));

vi.mock("@/shared/lib/upload", () => ({
  uploadToSignedUrl: singleUploadMock,
  uploadInParts: partsUploadMock,
}));

vi.mock("@/shared/component", () => ({ useToast: () => ({ error: toastErrorMock }) }));

vi.mock("@/shared/hook/useCapabilities", () => ({ useExercisedCapability: () => null }));

const CONVERSATION_ID = "cv-1";

const file = (name: string, type = "image/jpeg") => new File(["x"], name, { type });

const prepared = {
  type: MediaType.IMAGE,
  file: file("photo.jpg"),
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  size: 1_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  prepareMock.mockResolvedValue(prepared);
  requestUrlMock.mockResolvedValue({
    mode: UploadMode.SINGLE,
    uploadUrl: "https://signed",
    storagePath: "k/1",
  });
  sendMessageMock.mockResolvedValue({ id: "msg-1" });
  singleUploadMock.mockResolvedValue(undefined);
});

const setup = () => {
  const { wrapper, queryClient } = renderWithQueryClient();
  const { result } = renderHook(() => useSendMessageMedia(CONVERSATION_ID), { wrapper });
  return { result, queryClient };
};

describe("useSendMessageMedia", () => {
  it("envoie un message par fichier, dans l'ordre de la sélection", async () => {
    const { result } = setup();

    act(() => result.current.sendFiles([file("a.jpg"), file("b.jpg"), file("c.jpg")]));

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(3));
    // Chaque média EST un message : trois fichiers font trois messages, pas un message à trois
    // pièces jointes.
    expect(singleUploadMock).toHaveBeenCalledTimes(3);
  });

  /**
   * Le fil n'a AUCUN quota — rien ne borne donc naturellement une sélection, et quarante vidéos
   * partiraient à la suite. Le plafond est une borne d'usage côté client, et le surplus est dit
   * fichier par fichier plutôt que perdu en silence.
   */
  it("plafonne le lot et nomme chaque fichier laissé de côté", async () => {
    const { result } = setup();
    const files = Array.from({ length: MAX_MESSAGE_MEDIA_BATCH + 2 }, (_unused, index) =>
      file(`photo-${index}.jpg`),
    );

    act(() => result.current.sendFiles(files));

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(MAX_MESSAGE_MEDIA_BATCH));
    expect(toastErrorMock).toHaveBeenCalledTimes(2);
    expect(toastErrorMock.mock.calls[0]?.[0]).toContain(`photo-${MAX_MESSAGE_MEDIA_BATCH}.jpg`);
  });

  /**
   * Un toast PAR fichier, et non un compte rendu fondu en une ligne : « 2 sur 3 n'ont pas pu
   * partir » ne dirait pas lesquels, ce qui laisserait la sélection entière à refaire.
   */
  it("signale chaque échec par son nom, sans arrêter le lot", async () => {
    singleUploadMock.mockImplementation((_url: string, file: File) =>
      file.name === "b.jpg" ? Promise.reject(new Error("réseau")) : Promise.resolve(),
    );
    prepareMock.mockImplementation((source: { file: File }) => ({
      ...prepared,
      file: source.file,
      fileName: source.file.name,
    }));
    const { result } = setup();

    act(() => result.current.sendFiles([file("a.jpg"), file("b.jpg"), file("c.jpg")]));

    // Le troisième part quand même : un échec au milieu n'emporte pas ce qui suit.
    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledTimes(2));
    expect(toastErrorMock).toHaveBeenCalledOnce();
    expect(toastErrorMock.mock.calls[0]?.[0]).toContain("b.jpg");
  });

  it("écarte un fichier que le fil ne sait pas envoyer, sans le tenter", async () => {
    const { result } = setup();

    act(() => result.current.sendFiles([file("seance.pdf", "application/pdf")]));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
    expect(requestUrlMock).not.toHaveBeenCalled();
    expect(toastErrorMock.mock.calls[0]?.[0]).toContain("seance.pdf");
  });

  it("rafraîchit le fil à chaque message plutôt qu'à la fin", async () => {
    const { result, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    act(() => result.current.sendFiles([file("a.jpg"), file("b.jpg")]));

    // Deux clés par message (le fil, la liste des conversations) : les messages apparaissent au
    // fur et à mesure, comme s'ils avaient été envoyés un par un — ce que l'expéditeur a fait.
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
  });

  it("envoie une note vocale hors de tout lot", async () => {
    const { result } = setup();

    act(() => result.current.sendAudio({ blob: new Blob(["x"]), durationSeconds: 8 }));

    await waitFor(() => expect(sendMessageMock).toHaveBeenCalledOnce());
    expect(prepareMock.mock.calls[0]?.[0]).toMatchObject({ kind: "audio", durationSeconds: 8 });
  });

  it("dit l'échec d'une note vocale par un toast, faute de récapitulatif où le mettre", async () => {
    prepareMock.mockRejectedValue(new Error("format"));
    const { result } = setup();

    act(() => result.current.sendAudio({ blob: new Blob(["x"]), durationSeconds: 8 }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledOnce());
  });
});
