import { act, waitFor } from "@testing-library/react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { press, renderRn } from "@/test/render";
import { CmvAudioPlayer } from "./CmvAudioPlayer";

const FIRST = "https://s3.test/note.m4a?X-Amz-Date=120000";
const SECOND = "https://s3.test/note.m4a?X-Amz-Date=120010";
const FRESH = "https://s3.test/note.m4a?X-Amz-Date=121000";

/**
 * Un lecteur STABLE d'un rendu à l'autre, comme le vrai : le faux par défaut en fabrique un neuf à
 * chaque appel, et l'assertion porterait sur un objet que le composant n'a jamais touché.
 */
function fakePlayer() {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(async (_seconds: number) => undefined),
    replace: vi.fn(),
    remove: vi.fn(),
    playing: false,
    currentTime: 0,
  };
}

type Status = {
  playing: boolean;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  didJustFinish: boolean;
  error: string | null;
};

let player = fakePlayer();
let status: Status;

function setStatus(next: Partial<Status>) {
  status = { ...status, ...next };
}

function playButton(container: HTMLElement): Element {
  const icon = container.querySelector("[data-icon]");
  if (icon?.parentElement == null) throw new Error("bouton de lecture introuvable");
  return icon.parentElement;
}

function setup(resolveUrl = vi.fn(async (): Promise<string | null> => FRESH)) {
  const element = (url: string) => (
    <CmvAudioPlayer url={url} durationSeconds={90} resolveUrl={resolveUrl} />
  );
  let current = FIRST;
  const view = renderRn(element(current));
  const rerenderWith = (url: string) => {
    current = url;
    view.rerender(element(url));
  };
  // Le statut natif évolue hors de React : on le pousse, puis on redessine.
  const push = (next: Partial<Status>, url = FIRST) => {
    setStatus(next);
    rerenderWith(url);
  };
  /**
   * Attend « indisponible » ET que le bouton le sache. Voir le texte ne suffit pas : le `Pressable`
   * de `react-native-web` ne reçoit son nouveau `onPress` que dans un effet PASSIF, que React
   * planifie par `setImmediate`, alors que `waitFor` rend la main après un `setTimeout(0)`. Sous
   * Node, l'ordre des deux n'est pas garanti : sur une CI chargée, le clic partait vers l'ancien
   * `toggle`, qui ne réessayait pas (#301). Redessiner force React à vider ses effets en attente
   * avant de rendre — c'est ce qui rend le clic suivant déterministe.
   */
  const untilUnavailable = async () => {
    await waitFor(() => view.getByText("media.audio.unavailable"));
    rerenderWith(current);
  };
  return { ...view, resolveUrl, push, rerenderWith, untilUnavailable };
}

beforeEach(() => {
  player = fakePlayer();
  status = {
    playing: false,
    currentTime: 0,
    duration: 90,
    isLoaded: true,
    didJustFinish: false,
    error: null,
  };
  vi.mocked(useAudioPlayer).mockImplementation(
    () => player as unknown as ReturnType<typeof useAudioPlayer>,
  );
  vi.mocked(useAudioPlayerStatus).mockImplementation(
    () => status as unknown as ReturnType<typeof useAudioPlayerStatus>,
  );
});

describe("CmvAudioPlayer — l'URL change sous le lecteur (#304)", () => {
  /**
   * Le cœur du bug : `useAudioPlayer` recrée son lecteur à chaque source. Si le composant lui
   * passait l'URL des props, chaque re-signature coupait la note.
   */
  it("crée le lecteur sur la première URL et n'en crée jamais d'autre", () => {
    const { rerenderWith } = setup();
    rerenderWith(SECOND);

    const sources = vi.mocked(useAudioPlayer).mock.calls.map(([source]) => source);
    expect(new Set(sources)).toEqual(new Set([FIRST]));
  });

  it("garde son URL pendant la lecture", () => {
    const { rerenderWith } = setup();
    player.playing = true;
    player.currentTime = 12;
    rerenderWith(SECOND);

    expect(player.replace).not.toHaveBeenCalled();
  });

  // En pause à mi-chemin, recharger ramènerait la note à zéro à la prochaine lecture.
  it("garde son URL en pause à mi-chemin", () => {
    const { rerenderWith } = setup();
    player.currentTime = 12;
    rerenderWith(SECOND);

    expect(player.replace).not.toHaveBeenCalled();
  });

  // Au repos, rien n'est perdu : c'est là qu'on prend l'URL la plus fraîche.
  it("adopte l'URL neuve au repos", () => {
    const { rerenderWith } = setup();
    rerenderWith(SECOND);

    expect(player.replace).toHaveBeenCalledWith(SECOND);
  });
});

describe("CmvAudioPlayer — la lecture casse en route", () => {
  it("re-signe et reprend à la même position, en lecture si elle jouait", async () => {
    const { container, resolveUrl, push } = setup();
    press(playButton(container));
    player.play.mockClear();

    // L'URL a expiré pendant l'écoute : le storage refuse la suite.
    player.currentTime = 42;
    push({ playing: false, currentTime: 42, isLoaded: false, error: "403" });
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));
    expect(resolveUrl).toHaveBeenCalledTimes(1);

    // iOS refuse le saut tant que la nouvelle source n'est pas prête : on l'attend.
    expect(player.seekTo).not.toHaveBeenCalled();
    push({ isLoaded: true, error: null });

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(42);
  });

  it("reprend à la même position sans relancer une note qui était en pause", async () => {
    const { push } = setup();
    player.currentTime = 42;
    push({ currentTime: 42, isLoaded: false, error: "403" });
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));
    push({ isLoaded: true, error: null });

    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(42));
    expect(player.play).not.toHaveBeenCalled();
  });

  // Un saut refusé ne doit pas laisser la note muette : elle repart du début.
  it("relance la lecture même si le saut est refusé", async () => {
    const { container, push } = setup();
    press(playButton(container));
    player.play.mockClear();
    player.seekTo.mockRejectedValueOnce(new Error("seek"));

    push({ isLoaded: false, error: "403" });
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));
    push({ isLoaded: true, error: null });

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
  });

  it("le dit quand la re-signature échoue, et réessaie à la lecture", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => null);
    const { container, queryByText, push, untilUnavailable } = setup(resolveUrl);

    push({ isLoaded: false, error: "403" });
    await untilUnavailable();
    expect(player.replace).not.toHaveBeenCalled();

    resolveUrl.mockResolvedValueOnce(FRESH);
    press(playButton(container));
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));
    expect(queryByText("media.audio.unavailable")).toBeNull();

    push({ isLoaded: true, error: null });
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
  });

  it("reste indisponible si la nouvelle tentative échoue aussi", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => null);
    const { container, getByText, push, untilUnavailable } = setup(resolveUrl);
    push({ isLoaded: false, error: "403" });
    await untilUnavailable();

    press(playButton(container));

    await waitFor(() => expect(resolveUrl).toHaveBeenCalledTimes(2));
    // Le réessai efface le message au clic, et ne le remet qu'une fois la promesse résolue.
    await waitFor(() => getByText("media.audio.unavailable"));
    expect(player.replace).not.toHaveBeenCalled();
  });

  /**
   * Même URL rendue : elle vaut encore, ce n'est donc pas l'expiration qui a cassé la lecture
   * (réseau, fichier absent). La recharger d'office bouclerait sur la même erreur ; seul un geste
   * de l'utilisateur la relance.
   */
  it("ne recharge pas d'office une URL encore valide, mais la relance au geste", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => FIRST);
    const { container, push, untilUnavailable } = setup(resolveUrl);

    push({ isLoaded: false, error: "network" });
    await untilUnavailable();
    expect(player.replace).not.toHaveBeenCalled();

    press(playButton(container));
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FIRST));
  });

  it("ne recharge rien une fois démonté", async () => {
    let settle: (url: string) => void = () => {};
    const resolveUrl = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          settle = resolve;
        }),
    );
    const { push, unmount } = setup(resolveUrl);
    push({ isLoaded: false, error: "403" });
    await waitFor(() => expect(resolveUrl).toHaveBeenCalled());

    unmount();
    await act(async () => settle(FRESH));

    expect(player.replace).not.toHaveBeenCalled();
  });
});

describe("CmvAudioPlayer — lecture", () => {
  it("met en pause une note qui joue", () => {
    const { container, push } = setup();
    push({ playing: true, currentTime: 5 });

    press(playButton(container));

    expect(player.pause).toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("rejoue depuis le début une note terminée", () => {
    const { container, push } = setup();
    push({ currentTime: 90, didJustFinish: true });

    press(playButton(container));

    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalled();
  });
});
