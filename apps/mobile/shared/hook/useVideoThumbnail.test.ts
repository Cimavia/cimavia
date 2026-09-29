import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localVideoThumbnailUri, videoThumbnail } from "@/shared/lib/video-thumbnail";
import { useVideoThumbnail } from "./useVideoThumbnail";

// Le hook ne fait qu'aiguiller : le disque et le tirage sont éprouvés dans `video-thumbnail.test.ts`.
vi.mock("@/shared/lib/video-thumbnail", () => ({
  localVideoThumbnailUri: vi.fn((_mediaId: string): string | null => null),
  videoThumbnail: vi.fn(async (): Promise<string | null> => null),
}));

const THUMB = "file:///cache/video-thumbnails/msg-1.jpg";

type Props = { mediaId: string; resolveUrl: () => Promise<string | null> };

function setup(initial: Props) {
  return renderHook(
    ({ mediaId, resolveUrl }: Props) => useVideoThumbnail(mediaId, resolveUrl, 42),
    {
      initialProps: initial,
    },
  );
}

beforeEach(() => {
  vi.mocked(localVideoThumbnailUri).mockReturnValue(null);
  vi.mocked(videoThumbnail).mockResolvedValue(null);
});

describe("useVideoThumbnail", () => {
  // Déjà tirée : affichée dès le premier rendu, sans passer par la pastille.
  it("rend la vignette du disque dès le premier rendu, sans rien tirer", () => {
    vi.mocked(localVideoThumbnailUri).mockReturnValue(THUMB);

    const { result } = setup({ mediaId: "msg-1", resolveUrl: vi.fn(async () => null) });

    expect(result.current).toBe(THUMB);
    expect(videoThumbnail).not.toHaveBeenCalled();
  });

  it("rend null le temps du tirage, puis la vignette tirée", async () => {
    let finish: (uri: string | null) => void = () => undefined;
    vi.mocked(videoThumbnail).mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );

    const { result } = setup({ mediaId: "msg-1", resolveUrl: vi.fn(async () => null) });
    expect(result.current).toBeNull();

    finish(THUMB);

    await waitFor(() => expect(result.current).toBe(THUMB));
    expect(videoThumbnail).toHaveBeenCalledWith("msg-1", expect.any(Function), 42);
  });

  it("reste à null quand le tirage échoue", async () => {
    const { result } = setup({ mediaId: "msg-1", resolveUrl: vi.fn(async () => null) });

    await waitFor(() => expect(videoThumbnail).toHaveBeenCalled());

    expect(result.current).toBeNull();
  });

  /**
   * Le fil se redessine toutes les 10 s avec un résolveur neuf : il ne relance pas le tirage, mais
   * c'est bien le DERNIER qui sert quand la file arrive à cette vidéo.
   */
  it("ne relance rien sur un nouveau résolveur, et sert le plus récent", async () => {
    const first = vi.fn(async () => "https://s3.test/a");
    const latest = vi.fn(async () => "https://s3.test/b");
    const { rerender } = setup({ mediaId: "msg-1", resolveUrl: first });
    rerender({ mediaId: "msg-1", resolveUrl: latest });

    expect(videoThumbnail).toHaveBeenCalledTimes(1);
    const resolver = vi.mocked(videoThumbnail).mock.calls[0]?.[1];
    await resolver?.();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  // Une bulle recyclée par la liste pour un autre message ne garde pas l'image du précédent.
  it("repart du disque quand le média change", async () => {
    vi.mocked(videoThumbnail).mockResolvedValue(THUMB);
    const resolveUrl = vi.fn(async () => null);
    const { result, rerender } = setup({ mediaId: "msg-1", resolveUrl });
    await waitFor(() => expect(result.current).toBe(THUMB));
    vi.mocked(videoThumbnail).mockResolvedValue(null);

    rerender({ mediaId: "msg-2", resolveUrl });

    await waitFor(() => expect(result.current).toBeNull());
    expect(videoThumbnail).toHaveBeenLastCalledWith("msg-2", expect.any(Function), 42);
  });

  // Démonté avant la fin : la réponse n'est plus pour personne.
  it("ignore une vignette arrivée après le démontage", async () => {
    let finish: (uri: string | null) => void = () => undefined;
    vi.mocked(videoThumbnail).mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const { result, unmount } = setup({ mediaId: "msg-1", resolveUrl: vi.fn(async () => null) });

    unmount();
    finish(THUMB);
    await Promise.resolve();

    expect(result.current).toBeNull();
  });
});
