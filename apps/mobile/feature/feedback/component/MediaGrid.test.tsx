import { type FeedbackMediaDto, MediaType, type VoiceNoteCue } from "@cmv/shared";
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaGrid } from "@/feature/feedback/component/MediaGrid";
import { press, renderRn } from "@/test/render";

const { freshUrl, cues } = vi.hoisted(() => ({
  freshUrl: vi.fn(() => Promise.resolve(null)),
  // Ce que chaque lecteur a reçu de la grille pour s'enchaîner (#529), par URL.
  cues: new Map<string, VoiceNoteCue | undefined>(),
}));
vi.mock("@/shared/hook/useFreshMediaUrl", () => ({ useFreshMediaUrl: () => freshUrl }));

/**
 * Les trois lecteurs ont leurs tests : ce que la grille décide est LEQUEL elle monte, où — vignette
 * ou ligne —, et à qui elle redemande une url expirée. Chaque double dit son type, relaie la
 * demande d'url d'un tap, et garde ce que la grille lui dit pour l'enchaîner (#529).
 */
vi.mock("@/shared/component", async (importOriginal) => {
  const player =
    (kind: string) =>
    ({
      url,
      resolveUrl,
      cue,
    }: Readonly<{ url?: string; resolveUrl?: () => void; cue?: VoiceNoteCue }>) => {
      if (url != null) cues.set(url, cue);
      return <button type="button" data-player={kind} onClick={() => resolveUrl?.()} />;
    };
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    CmvAudioPlayer: player("audio"),
    CmvVideoPlayer: player("video"),
    CmvImageViewer: player("photo"),
  };
});

const media = (id: string, type: MediaType): FeedbackMediaDto =>
  ({
    id,
    type,
    url: `https://storage.test/${id}`,
    durationSeconds: type === MediaType.IMAGE ? null : 12,
  }) as FeedbackMediaDto;

const ALL = [
  media("m-audio", MediaType.AUDIO),
  media("m-photo", MediaType.IMAGE),
  media("m-video", MediaType.VIDEO),
];

function renderGrid(items: FeedbackMediaDto[], isRemoving = false) {
  const onRemove = vi.fn();
  return {
    onRemove,
    ...renderRn(
      <MediaGrid media={items} sessionId="ss-1" onRemove={onRemove} isRemoving={isRemoving} />,
    ),
  };
}

const players = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-player]")).map((node) =>
    node.getAttribute("data-player"),
  );

describe("MediaGrid", () => {
  it("ne rend rien sans média", () => {
    const { container } = renderGrid([]);

    expect(container.textContent).toBe("");
  });

  /** Une note vocale ne tient pas dans une vignette : photos et vidéos d'abord, les notes dessous. */
  it("range photos et vidéos en vignettes, puis les notes vocales en lignes", () => {
    const { container } = renderGrid(ALL);

    expect(players(container)).toEqual(["photo", "video", "audio"]);
  });

  it("ne pose pas de grille quand il n'y a que des notes vocales", () => {
    const { container } = renderGrid([media("m-audio", MediaType.AUDIO)]);

    expect(players(container)).toEqual(["audio"]);
  });

  it.each([
    ["video", "m-video"],
    ["audio", "m-audio"],
  ])("redemande l'url du média %s par son identifiant", (kind, id) => {
    const { container } = renderGrid(ALL);

    press(container.querySelector(`[data-player="${kind}"]`) as HTMLElement);

    expect(freshUrl).toHaveBeenCalledWith(id);
  });

  it("retire la note vocale désignée", () => {
    const { getAllByText, onRemove } = renderGrid(ALL);

    // Deux vignettes d'abord, puis la ligne de la note : son « retirer » est le dernier.
    press(getAllByText("feedback.media.remove").at(-1) as HTMLElement);

    expect(onRemove).toHaveBeenCalledExactlyOnceWith("m-audio");
  });

  it("enchaîne les notes vocales dans l'ordre du débrief, photo et vidéo sautées (#529)", () => {
    renderGrid([...ALL, media("m-audio-2", MediaType.AUDIO)]);

    act(() => cues.get("https://storage.test/m-audio")?.onFinish());

    expect(cues.get("https://storage.test/m-audio-2")?.cued).toBe(true);
  });

  it("ferme chaque retrait pendant qu'un retrait est en cours", () => {
    const { container } = renderGrid(ALL, true);

    expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(3);
  });
});
