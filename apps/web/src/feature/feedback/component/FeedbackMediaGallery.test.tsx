import { type FeedbackMediaDto, MediaType } from "@cmv/shared";
import { fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { playToTheEnd, stubPlayback } from "../../../../test/media";
import { renderWithProviders } from "../../../../test/render";
import { FeedbackMediaGallery } from "./FeedbackMediaGallery";

const media = (over: Partial<FeedbackMediaDto> & Pick<FeedbackMediaDto, "id" | "type">) =>
  ({
    url: `https://s3/${over.id}`,
    fileName: `${over.id}.bin`,
    mimeType: "application/octet-stream",
    sizeBytes: 10,
    durationSeconds: null,
    createdAt: "2026-10-16T19:42:00.000Z",
    ...over,
  }) as FeedbackMediaDto;

const IMAGE = media({ id: "md-img", type: MediaType.IMAGE, fileName: "voie.jpg" });
const AUDIO = media({ id: "md-audio", type: MediaType.AUDIO, fileName: "note.m4a" });
const VIDEO = media({ id: "md-video", type: MediaType.VIDEO, fileName: "essai.mp4" });

function renderGallery(items: FeedbackMediaDto[], isRemoving = false) {
  const onRemove = vi.fn();
  const resolveMediaUrl = vi.fn(async (_id: string) => null);
  const view = renderWithProviders(
    <FeedbackMediaGallery
      media={items}
      onRemove={onRemove}
      isRemoving={isRemoving}
      resolveMediaUrl={resolveMediaUrl}
    />,
  );
  return { ...view, onRemove, resolveMediaUrl };
}

describe("FeedbackMediaGallery", () => {
  it("ne rend rien sans média", () => {
    const { container } = renderGallery([]);

    expect(container.querySelector("img, audio, video")).toBeNull();
  });

  // La photo s'ouvre en grand : une vignette ne montre pas une prise de pied.
  it("rend la photo en vignette qui s'ouvre en grand", () => {
    const { getByRole } = renderGallery([IMAGE]);

    expect(getByRole("img", { name: "voie.jpg" })).toHaveAttribute("src", IMAGE.url);
    expect(getByRole("link")).toHaveAttribute("href", IMAGE.url);
  });

  // Chaque type a SON lecteur : une vidéo rendue par une balise audio ne se regarde pas (#151).
  it("rend la note vocale et la vidéo par leur propre lecteur", () => {
    const { container } = renderGallery([AUDIO, VIDEO]);

    expect(container.querySelector("audio")).toHaveAttribute("src", AUDIO.url);
    expect(container.querySelector("video")).toHaveAttribute("src", VIDEO.url);
    expect(container.querySelector("img")).toBeNull();
  });

  // L'url signée expire : celle qui lâche se fait re-signer par SON id, pas par celui d'un voisin.
  it("fait re-signer le média dont la lecture échoue", async () => {
    const { container, resolveMediaUrl } = renderGallery([AUDIO, VIDEO]);

    fireEvent.error(container.querySelector("video") as HTMLVideoElement);

    await waitFor(() => expect(resolveMediaUrl).toHaveBeenCalledWith("md-video"));
    expect(resolveMediaUrl).not.toHaveBeenCalledWith("md-audio");
  });

  it("retire le média choisi", async () => {
    const { user, getAllByRole, onRemove } = renderGallery([IMAGE, AUDIO]);

    await user.click(getAllByRole("button", { name: "feedback.media.remove" })[1] as HTMLElement);

    expect(onRemove).toHaveBeenCalledWith("md-audio");
  });

  // Un retrait à la fois : pendant l'envoi, aucun autre ne part.
  it("éteint les retraits pendant qu'un retrait est en cours", () => {
    const { getAllByRole } = renderGallery([IMAGE, AUDIO], true);

    for (const button of getAllByRole("button", { name: "feedback.media.remove" })) {
      expect(button).toBeDisabled();
    }
  });
});

describe("FeedbackMediaGallery — notes vocales enchaînées (#529)", () => {
  const NEXT = media({ id: "md-audio-2", type: MediaType.AUDIO, fileName: "suite.m4a" });

  it("lance la note suivante à la fin d'une note, en sautant photo et vidéo", () => {
    const { container } = renderGallery([AUDIO, IMAGE, VIDEO, NEXT]);
    const [first, video, next] = stubPlayback(container) as HTMLMediaElement[];

    playToTheEnd(first as HTMLMediaElement);

    expect(next?.play).toHaveBeenCalledOnce();
    expect(video?.play).not.toHaveBeenCalled();
  });

  it("ne relance rien après la dernière note", () => {
    const { container } = renderGallery([AUDIO, NEXT]);
    const [first, last] = stubPlayback(container);

    playToTheEnd(last as HTMLMediaElement);

    expect(first?.play).not.toHaveBeenCalled();
  });
});
