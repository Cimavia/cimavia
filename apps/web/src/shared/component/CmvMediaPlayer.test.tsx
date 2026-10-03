import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { playToTheEnd, stubPlayback } from "../../../test/media";
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

describe("CmvMediaPlayer — le premier chargement", () => {
  it("ne déplace ni ne lance un lecteur qui n'a rien à reprendre", () => {
    const { element, play } = renderPlayer();
    mediaState(element, { paused: true, currentTime: 0 });

    fireEvent.loadedMetadata(element);

    expect(element.currentTime).toBe(0);
    expect(play).not.toHaveBeenCalled();
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

describe("CmvMediaPlayer — une seule note à la fois (#529)", () => {
  it("met en pause la note qui joue quand une autre démarre", () => {
    const first = render(<CmvMediaPlayer kind="audio" url={FIRST} resolveUrl={async () => null} />);
    const second = render(
      <CmvMediaPlayer kind="audio" url={RESIGNED} resolveUrl={async () => null} />,
    );
    const [playing] = stubPlayback(first.container);
    const [started] = stubPlayback(second.container);

    fireEvent.play(playing as HTMLMediaElement);
    fireEvent.play(started as HTMLMediaElement);

    expect(playing?.pause).toHaveBeenCalledOnce();
    expect(started?.pause).not.toHaveBeenCalled();
  });

  it("laisse jouer une note quand c'est une vidéo qui démarre", () => {
    const note = render(<CmvMediaPlayer kind="audio" url={FIRST} resolveUrl={async () => null} />);
    const video = render(
      <CmvMediaPlayer kind="video" url={RESIGNED} resolveUrl={async () => null} />,
    );
    const [playing] = stubPlayback(note.container);

    fireEvent.play(playing as HTMLMediaElement);
    fireEvent.play(stubPlayback(video.container)[0] as HTMLMediaElement);

    expect(playing?.pause).not.toHaveBeenCalled();
  });
});

describe("CmvMediaPlayer — enchaînement (#529)", () => {
  function renderCued() {
    const onPlay = vi.fn();
    const onFinish = vi.fn();
    const element = (cued: boolean) => (
      <CmvMediaPlayer
        kind="audio"
        url={FIRST}
        resolveUrl={async () => null}
        cue={{ cued, onPlay, onFinish }}
      />
    );
    const view = render(element(false));
    const audio = stubPlayback(view.container)[0] as HTMLMediaElement;
    return {
      ...view,
      audio,
      onPlay,
      onFinish,
      cue: (cued: boolean) => view.rerender(element(cued)),
    };
  }

  it("démarre au début quand la liste le demande", () => {
    const { audio, cue } = renderCued();
    mediaState(audio, { paused: true, currentTime: 30 });

    cue(true);

    expect(audio.currentTime).toBe(0);
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it("ne démarre pas tant que rien n'est demandé", () => {
    const { audio } = renderCued();

    expect(audio.play).not.toHaveBeenCalled();
  });

  it("se tait quand le navigateur refuse la lecture hors d'un geste", async () => {
    const { audio, cue, queryByText } = renderCued();
    const refused = vi.fn(async () => {
      throw new DOMException("refusé", "NotAllowedError");
    });
    audio.play = refused;

    cue(true);

    await waitFor(() => expect(refused).toHaveBeenCalled());
    expect(queryByText("common.mediaUnavailable")).toBeNull();
  });

  it("prévient la liste quand elle démarre", () => {
    const { audio, onPlay } = renderCued();

    fireEvent.play(audio);

    expect(onPlay).toHaveBeenCalledOnce();
  });

  it("demande la suivante quand elle va au bout en jouant", () => {
    const { audio, onFinish } = renderCued();

    playToTheEnd(audio);

    expect(onFinish).toHaveBeenCalledOnce();
  });

  // Le curseur natif permet de l'amener au bout en pause : `ended` part, sans `pause` avant lui.
  it("ne demande rien quand on amène au bout une note en pause", () => {
    const { audio, onFinish } = renderCued();
    fireEvent.play(audio);
    fireEvent.pause(audio);

    Object.defineProperty(audio, "ended", { configurable: true, value: true });
    fireEvent.ended(audio);

    expect(onFinish).not.toHaveBeenCalled();
  });
});
