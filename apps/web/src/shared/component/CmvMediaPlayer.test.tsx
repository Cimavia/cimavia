import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CmvMediaPlayer } from "./CmvMediaPlayer";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const FIRST = "https://s3.test/note.m4a?X-Amz-Date=120000";
const RESIGNED = "https://s3.test/note.m4a?X-Amz-Date=120010";

/**
 * jsdom ne joue rien : `paused`, `currentTime` et `play()` sont posés à la main, et c'est bien ce
 * qu'on veut — le lecteur ne décide que sur ces trois lectures.
 */
function mediaState(element: HTMLMediaElement, state: { paused: boolean; currentTime: number }) {
  Object.defineProperty(element, "paused", { configurable: true, value: state.paused });
  Object.defineProperty(element, "currentTime", {
    configurable: true,
    writable: true,
    value: state.currentTime,
  });
}

function renderPlayer(resolveUrl = vi.fn(async (): Promise<string | null> => RESIGNED)) {
  const view = render(<CmvMediaPlayer kind="audio" url={FIRST} resolveUrl={resolveUrl} />);
  const element = view.container.querySelector("audio") as HTMLAudioElement;
  const play = vi.fn(async () => undefined);
  element.play = play;
  const rerender = (url: string) =>
    view.rerender(<CmvMediaPlayer kind="audio" url={url} resolveUrl={resolveUrl} />);
  return { ...view, element, play, rerender, resolveUrl };
}

describe("CmvMediaPlayer — l'URL qui arrive", () => {
  it("est adoptée par un lecteur jamais lancé", () => {
    const { element, rerender } = renderPlayer();
    mediaState(element, { paused: true, currentTime: 0 });

    rerender(RESIGNED);

    expect(element.getAttribute("src")).toBe(RESIGNED);
  });

  // #304 : le cas qui coupait la note vocale toutes les 10 s.
  it("ne touche pas au lecteur qui joue", () => {
    const { element, rerender } = renderPlayer();
    mediaState(element, { paused: false, currentTime: 12 });

    rerender(RESIGNED);

    expect(element.getAttribute("src")).toBe(FIRST);
  });

  // En pause au milieu, le lecteur est encore « en cours » : repartir de zéro perdrait la position.
  it("ne touche pas au lecteur en pause au milieu", () => {
    const { element, rerender } = renderPlayer();
    mediaState(element, { paused: true, currentTime: 42 });

    rerender(RESIGNED);

    expect(element.getAttribute("src")).toBe(FIRST);
  });
});

describe("CmvMediaPlayer — l'URL qui lâche en cours de route", () => {
  it("reprend sur une URL re-signée, à la même position, et relance la lecture", async () => {
    const { element, play, resolveUrl } = renderPlayer();
    fireEvent.play(element);
    mediaState(element, { paused: true, currentTime: 95 });

    fireEvent.error(element);
    await waitFor(() => expect(element.getAttribute("src")).toBe(RESIGNED));
    // Le nouveau `src` recharge le média : le navigateur repart de zéro, c'est le lecteur qui revient.
    mediaState(element, { paused: true, currentTime: 0 });
    fireEvent.loadedMetadata(element);

    expect(resolveUrl).toHaveBeenCalledOnce();
    expect(element.currentTime).toBe(95);
    expect(play).toHaveBeenCalledOnce();
  });

  // En pause quand l'URL a lâché : on reprend la position, mais on ne relance pas à sa place.
  it("ne relance pas une lecture que l'utilisateur avait mise en pause", async () => {
    const { element, play } = renderPlayer();
    fireEvent.play(element);
    fireEvent.pause(element);
    mediaState(element, { paused: true, currentTime: 30 });

    fireEvent.error(element);
    await waitFor(() => expect(element.getAttribute("src")).toBe(RESIGNED));
    // Le nouveau `src` recharge le média : le navigateur repart de zéro, c'est le lecteur qui revient.
    mediaState(element, { paused: true, currentTime: 0 });
    fireEvent.loadedMetadata(element);

    expect(element.currentTime).toBe(30);
    expect(play).not.toHaveBeenCalled();
  });

  it("le dit quand la re-signature est impossible, sans toucher à l'URL", async () => {
    const { element, findByText } = renderPlayer(vi.fn(async () => null));

    fireEvent.error(element);

    expect(await findByText("common.mediaUnavailable")).not.toBeNull();
    expect(element.getAttribute("src")).toBe(FIRST);
  });

  /**
   * La même URL rendue par la re-signature a déjà échoué : c'est autre chose que l'échéance (fichier
   * retiré, storage injoignable). La reprendre relancerait l'erreur, en boucle.
   */
  it("s'arrête quand la re-signature rend l'URL qui vient d'échouer", async () => {
    const { element, findByText, resolveUrl } = renderPlayer(vi.fn(async () => FIRST));

    fireEvent.error(element);

    expect(await findByText("common.mediaUnavailable")).not.toBeNull();
    expect(resolveUrl).toHaveBeenCalledOnce();
  });

  it("efface le message dès que la lecture repart", async () => {
    const { element, findByText, queryByText } = renderPlayer(vi.fn(async () => null));
    fireEvent.error(element);
    await findByText("common.mediaUnavailable");

    fireEvent.play(element);

    expect(queryByText("common.mediaUnavailable")).toBeNull();
  });
});

describe("CmvMediaPlayer — vidéo", () => {
  it("rend le lecteur vidéo du navigateur", () => {
    const { container } = render(
      <CmvMediaPlayer kind="video" url={FIRST} resolveUrl={async () => null} />,
    );

    expect(container.querySelector("video")?.getAttribute("src")).toBe(FIRST);
  });
});
