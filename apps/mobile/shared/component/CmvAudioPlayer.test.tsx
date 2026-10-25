import type { VoiceNoteCue } from "@cmv/shared";
import * as Sentry from "@sentry/react-native";
import { act, waitFor } from "@testing-library/react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect } from "react";
import { View } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushLayout, grab, press, renderRn, stubLayoutWidth, tap } from "@/test/render";
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

// Les boutons de lecture rendus, dans l'ordre du document.
function playButtons(container: HTMLElement): Element[] {
  return [...container.querySelectorAll("[data-icon]")].map((icon) => {
    if (icon.parentElement == null) throw new Error("bouton de lecture introuvable");
    return icon.parentElement;
  });
}

function playButton(container: HTMLElement): Element {
  const [button] = playButtons(container);
  if (button == null) throw new Error("bouton de lecture introuvable");
  return button;
}

function setup(
  resolveUrl = vi.fn(async (): Promise<string | null> => FRESH),
  initialCue?: VoiceNoteCue,
) {
  let current = FIRST;
  let cue = initialCue;
  const element = () => (
    <CmvAudioPlayer url={current} durationSeconds={90} resolveUrl={resolveUrl} cue={cue} />
  );
  const view = renderRn(element());
  const rerenderWith = (url: string) => {
    current = url;
    view.rerender(element());
  };
  // Ce que la liste dit à la note change : elle la désigne, ou l'oublie.
  const cueWith = (next: VoiceNoteCue) => {
    cue = next;
    view.rerender(element());
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
  return { ...view, resolveUrl, push, rerenderWith, cueWith, untilUnavailable };
}

/**
 * Une note ENGAGÉE, en pause au début : son lecteur natif existe, rien n'a été joué. Une note rendue
 * n'en a pas (#712) ; les cas qui parlent du lecteur partent de là — on la lance, puis on la met en
 * pause —, les appels du lecteur étant ensuite effacés.
 */
async function engaged(resolveUrl?: Parameters<typeof setup>[0], initialCue?: VoiceNoteCue) {
  const view = setup(resolveUrl, initialCue);
  press(playButton(view.container));
  await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
  view.push({ playing: true });
  press(playButton(view.container));
  view.push({ playing: false });
  for (const spy of [player.play, player.pause, player.seekTo, player.replace]) spy.mockClear();
  return view;
}

// Ce que la liste dit à une note (#529) : désignée ou non, et ses deux rappels, observables.
function listedCue(cued = false) {
  return { cued, onPlay: vi.fn(), onFinish: vi.fn() };
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
  it("crée le lecteur sur la première URL et n'en crée jamais d'autre", async () => {
    const { rerenderWith } = await engaged();
    rerenderWith(SECOND);

    const sources = vi.mocked(useAudioPlayer).mock.calls.map(([source]) => source);
    expect(new Set(sources)).toEqual(new Set([FIRST]));
  });

  it("garde son URL pendant la lecture", async () => {
    const { rerenderWith } = await engaged();
    player.playing = true;
    player.currentTime = 12;
    rerenderWith(SECOND);

    expect(player.replace).not.toHaveBeenCalled();
  });

  // En pause à mi-chemin, recharger ramènerait la note à zéro à la prochaine lecture.
  it("garde son URL en pause à mi-chemin", async () => {
    const { rerenderWith } = await engaged();
    player.currentTime = 12;
    rerenderWith(SECOND);

    expect(player.replace).not.toHaveBeenCalled();
  });

  // Au repos, rien n'est perdu : c'est là qu'on prend l'URL la plus fraîche.
  it("adopte l'URL neuve au repos", async () => {
    const { rerenderWith } = await engaged();
    rerenderWith(SECOND);

    expect(player.replace).toHaveBeenCalledWith(SECOND);
  });
});

describe("CmvAudioPlayer — la lecture casse en route", () => {
  it("re-signe et reprend à la même position, en lecture si elle jouait", async () => {
    const { container, resolveUrl, push } = await engaged();
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
    const { push } = await engaged();
    player.currentTime = 42;
    push({ currentTime: 42, isLoaded: false, error: "403" });
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));
    push({ isLoaded: true, error: null });

    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(42));
    expect(player.play).not.toHaveBeenCalled();
  });

  // Un saut refusé ne doit pas laisser la note muette : elle repart du début.
  it("relance la lecture même si le saut est refusé", async () => {
    const { container, push } = await engaged();
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
    const { container, queryByText, push, untilUnavailable } = await engaged(resolveUrl);

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
    const { container, getByText, push, untilUnavailable } = await engaged(resolveUrl);
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
    const { container, push, untilUnavailable } = await engaged(resolveUrl);

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
    const { push, unmount } = await engaged(resolveUrl);
    push({ isLoaded: false, error: "403" });
    await waitFor(() => expect(resolveUrl).toHaveBeenCalled());

    unmount();
    await act(async () => settle(FRESH));

    expect(player.replace).not.toHaveBeenCalled();
  });
});

describe("CmvAudioPlayer — remontée à Sentry (#701)", () => {
  it("remonte ce que le natif a répondu, avec l'hôte de la note", async () => {
    const { push } = await engaged();

    push({ playing: false, isLoaded: false, error: "Response code: 403" });

    await waitFor(() => expect(Sentry.captureMessage).toHaveBeenCalledTimes(1));
    expect(Sentry.captureMessage).toHaveBeenCalledWith("Lecture d'une note vocale échouée", {
      level: "error",
      tags: { platform: "web", host: "s3.test" },
      extra: { nativeMessage: "Response code: 403" },
    });
  });

  it("n'emporte jamais l'URL signée que le natif cite", async () => {
    const { push } = await engaged();

    push({ isLoaded: false, error: `Source error: ${FIRST}` });

    await waitFor(() => expect(Sentry.captureMessage).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(vi.mocked(Sentry.captureMessage).mock.calls)).not.toContain("X-Amz");
  });

  it("ne remonte rien tant que la lecture ne casse pas", async () => {
    await engaged();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("remonte aussi la panne qui survient après une re-signature", async () => {
    const { push } = await engaged();

    push({ isLoaded: false, error: "403" });
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));
    push({ isLoaded: false, error: "timeout" });

    await waitFor(() => expect(Sentry.captureMessage).toHaveBeenCalledTimes(2));
  });
});

describe("CmvAudioPlayer — lecture", () => {
  it("met en pause une note qui joue", async () => {
    const { container, push } = await engaged();
    push({ playing: true, currentTime: 5 });

    press(playButton(container));

    expect(player.pause).toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("rejoue depuis le début une note terminée", async () => {
    const { container, push } = await engaged();
    push({ currentTime: 90, didJustFinish: true });

    press(playButton(container));

    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalled();
  });
});

/**
 * La durée d'une note vient d'abord du serveur, qui l'a mesurée à l'envoi ; à défaut, du lecteur,
 * qui ne la connaît qu'une fois la source chargée (0 avant). Au repos, c'est elle que le compteur
 * affiche.
 */
describe("CmvAudioPlayer — durée affichée au repos", () => {
  function renderWithoutServerDuration() {
    return renderRn(<CmvAudioPlayer url={FIRST} durationSeconds={null} resolveUrl={vi.fn()} />);
  }

  it("prend celle du lecteur quand le serveur n'en a pas", () => {
    setStatus({ duration: 75 });

    const { container, getByText } = renderWithoutServerDuration();
    // Le lecteur n'existe qu'à l'engagement : c'est lui qui la connaît.
    press(playButton(container));

    expect(getByText("1:15")).toBeTruthy();
  });

  /** Sans durée connue, 0:00 et non une barre qui déborde ou un NaN : rien n'est encore joué. */
  it("affiche 0:00 quand personne ne la connaît encore", () => {
    setStatus({ duration: 0, isLoaded: false });

    const { getByText } = renderWithoutServerDuration();

    expect(getByText("0:00")).toBeTruthy();
  });

  it("ne relance pas depuis le début une note inconnue qu'on met en lecture", async () => {
    setStatus({ duration: 0, currentTime: 0 });

    const { container } = renderWithoutServerDuration();
    press(playButton(container));

    await waitFor(() => expect(player.play).toHaveBeenCalled());
    expect(player.seekTo).not.toHaveBeenCalled();
  });
});

/**
 * Déplacer le curseur (#536). La barre fait 200 px pour une note de 90 s : le milieu vaut 45 s. Le
 * faux lecteur ne bouge pas de lui-même — `player.currentTime` reste à 0 après un saut —, si bien
 * qu'une position qui revient vient forcément du composant.
 */
describe("CmvAudioPlayer — déplacer le curseur (#536)", () => {
  beforeEach(() => {
    stubLayoutWidth(200);
  });

  // La zone qui prend le doigt, une fois la barre mesurée.
  async function seekZone(view: ReturnType<typeof setup>): Promise<Element> {
    await flushLayout();
    const zone = view.getByRole("slider").firstElementChild;
    if (zone == null) throw new Error("zone tactile introuvable");
    return zone;
  }

  // Un saut que le lecteur n'achève jamais : celui qui tombe sur une URL expirée.
  function stallNextSeek() {
    player.seekTo.mockReturnValueOnce(new Promise<undefined>(() => {}));
  }

  it("amène la note au point touché, à mi-barre au milieu", async () => {
    const view = await engaged();
    tap(await seekZone(view), 100);

    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(45));
    expect(player.play).not.toHaveBeenCalled();
  });

  it("ne saute qu'une fois, au relâché, et montre le temps sous le doigt pendant le glissé", async () => {
    const view = await engaged();
    const finger = grab(await seekZone(view), 50);
    finger.moveTo(100);
    finger.moveTo(150);

    // 150 px sur 200 : 67,5 s — le statut, lui, dit toujours 0.
    expect(view.getByText("1:07")).toBeTruthy();
    expect(player.seekTo).not.toHaveBeenCalled();

    finger.release(150);
    await waitFor(() => expect(player.seekTo).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(67.5);
  });

  it("borne la position à la note", async () => {
    const view = await engaged();
    const finger = grab(await seekZone(view), 50);
    finger.moveTo(400);
    finger.release(400);

    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(90));
  });

  it("continue de jouer une note déplacée pendant la lecture", async () => {
    const view = setup();
    press(playButton(view.container));
    view.push({ playing: true, currentTime: 10 });
    player.play.mockClear();

    tap(await seekZone(view), 100);

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(45);
    expect(player.pause).not.toHaveBeenCalled();
  });

  /**
   * La pause AVANT le saut est ce qui retient Android : en fin de note, il ne met jamais son lecteur
   * en pause, et un saut sur une note terminée la relancerait d'office.
   */
  it("garde en pause une note déplacée en pause", async () => {
    const view = await engaged();
    view.push({ currentTime: 10 });

    tap(await seekZone(view), 100);

    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(45));
    expect(player.pause).toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("ramène une note terminée au point visé, et la relance de là, pas du début", async () => {
    const view = await engaged();
    press(playButton(view.container));
    view.push({ playing: false, currentTime: 90, didJustFinish: true });
    player.play.mockClear();

    tap(await seekZone(view), 100);
    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(45));
    expect(player.pause).toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();

    // Le statut que le lecteur émet après le saut : la note n'est plus finie.
    view.push({ currentTime: 45, didJustFinish: false });
    press(playButton(view.container));

    expect(player.seekTo).not.toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  // Sur le réseau, le saut prend du temps : le statut « finie » qu'on a encore ne dit plus rien.
  it("ne ramène pas au début une note terminée relancée pendant son saut", async () => {
    const view = await engaged();
    view.push({ currentTime: 90, didJustFinish: true });
    stallNextSeek();
    tap(await seekZone(view), 100);
    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(45));

    press(playButton(view.container));

    expect(player.seekTo).not.toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalled();
  });

  // iOS refuse le saut tant que la source n'est pas prête : il attend le chargement.
  it("applique au chargement le saut d'une note pas encore chargée", async () => {
    setStatus({ isLoaded: false });
    const view = await engaged();
    tap(await seekZone(view), 100);
    expect(player.seekTo).not.toHaveBeenCalled();

    view.push({ isLoaded: true });

    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(45));
    expect(player.play).not.toHaveBeenCalled();
  });

  it("lance du point visé une note lancée avant d'avoir chargé le saut", async () => {
    setStatus({ isLoaded: false });
    const view = setup();
    tap(await seekZone(view), 100);
    press(playButton(view.container));
    player.play.mockClear();

    view.push({ isLoaded: true });

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(45);
  });

  /**
   * Le piège nommé par l'issue : (B) reprenait `player.currentTime`, qui n'a pas forcément bougé
   * quand le saut lui-même casse sur l'URL expirée.
   */
  it("reprend au point visé quand l'URL expire sur le saut", async () => {
    const view = await engaged();
    stallNextSeek();
    tap(await seekZone(view), 100);

    view.push({ isLoaded: false, error: "403" });
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));
    view.push({ isLoaded: true, error: null });

    await waitFor(() => expect(player.seekTo).toHaveBeenCalledTimes(2));
    expect(player.seekTo).toHaveBeenLastCalledWith(45);
    expect(player.play).not.toHaveBeenCalled();
  });

  // Une note finie ne « veut » plus jouer : le rechargement ne la relance pas d'office.
  it("ne relance pas une note terminée qu'on déplace quand l'URL expire", async () => {
    const view = await engaged();
    press(playButton(view.container));
    view.push({ playing: false, currentTime: 90, didJustFinish: true });
    player.play.mockClear();
    stallNextSeek();
    tap(await seekZone(view), 100);

    view.push({ isLoaded: false, error: "403" });
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));
    view.push({ isLoaded: true, error: null });

    await waitFor(() => expect(player.seekTo).toHaveBeenCalledTimes(2));
    expect(player.play).not.toHaveBeenCalled();
  });

  // L'arbitrage de #529 : seule une note qui JOUAIT quand elle s'est terminée lance la suivante.
  it("enchaîne une note amenée au bout pendant la lecture (#529)", async () => {
    const listed = listedCue();
    const view = setup(undefined, listed);
    press(playButton(view.container));
    view.push({ playing: true, currentTime: 10 });

    tap(await seekZone(view), 200);
    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(90));
    view.push({ playing: false, currentTime: 90, didJustFinish: true });

    expect(listed.onFinish).toHaveBeenCalledTimes(1);
  });

  it("ne lance rien quand on amène au bout une note en pause (#529)", async () => {
    const listed = listedCue();
    const view = await engaged(undefined, listed);
    view.push({ currentTime: 10 });

    tap(await seekZone(view), 200);
    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(90));
    view.push({ currentTime: 90, didJustFinish: true });

    expect(listed.onFinish).not.toHaveBeenCalled();
  });

  it("rend la barre inerte tant que la note est cassée", async () => {
    const view = await engaged();
    view.push({ isLoaded: false, error: "403" });

    tap(await seekZone(view), 100);

    expect(view.getByRole("slider").getAttribute("aria-disabled")).toBe("true");
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it("rend la barre inerte tant que personne ne connaît la durée", async () => {
    setStatus({ duration: 0 });
    const view = renderRn(
      <CmvAudioPlayer url={FIRST} durationSeconds={null} resolveUrl={vi.fn()} />,
    );
    await flushLayout();
    const slider = view.getByRole("slider");
    const zone = slider.firstElementChild;
    if (zone == null) throw new Error("zone tactile introuvable");

    tap(zone, 100);

    expect(slider.getAttribute("aria-disabled")).toBe("true");
    expect(player.seekTo).not.toHaveBeenCalled();
  });
});

describe("CmvAudioPlayer — enchaînement (#529)", () => {
  it("dit à la liste qu'elle démarre quand on la lance à la main", () => {
    const listed = listedCue();
    const view = setup(undefined, listed);

    press(playButton(view.container));

    expect(listed.onPlay).toHaveBeenCalledTimes(1);
  });

  // Désignée en pause à mi-chemin, elle repart du début : c'est la suite de la conversation.
  it("démarre au début quand la liste la désigne, et le lui dit", async () => {
    const view = setup(undefined, listedCue());
    view.push({ currentTime: 30 });
    const cued = listedCue(true);

    view.cueWith(cued);

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(cued.onPlay).toHaveBeenCalledTimes(1);
  });

  // iOS refuse le saut tant que la source n'est pas prête : la note désignée attend son chargement.
  it("attend le chargement d'une note désignée avant qu'elle soit prête", async () => {
    setStatus({ isLoaded: false });
    const view = setup(undefined, listedCue());

    view.cueWith(listedCue(true));
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    view.push({ isLoaded: true });

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(0);
  });

  it("re-signe une note indisponible avant de la démarrer", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => null);
    const view = await engaged(resolveUrl, listedCue());
    view.push({ isLoaded: false, error: "403" });
    await view.untilUnavailable();
    resolveUrl.mockResolvedValueOnce(FRESH);

    view.cueWith(listedCue(true));
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));
    view.push({ isLoaded: true, error: null });

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(0);
  });

  it("annonce sa fin à la liste quand elle jouait", () => {
    const listed = listedCue();
    const view = setup(undefined, listed);
    press(playButton(view.container));
    view.push({ playing: true, currentTime: 80 });

    view.push({ playing: false, currentTime: 90, didJustFinish: true });

    expect(listed.onFinish).toHaveBeenCalledTimes(1);
  });

  // Finie, elle ne « veut » plus jouer : un second statut de fin ne relance pas l'enchaînement.
  it("n'annonce sa fin qu'une fois", () => {
    const listed = listedCue();
    const view = setup(undefined, listed);
    press(playButton(view.container));
    view.push({ playing: false, currentTime: 90, didJustFinish: true });

    view.push({ didJustFinish: false });
    view.push({ didJustFinish: true });

    expect(listed.onFinish).toHaveBeenCalledTimes(1);
  });
});

/**
 * Deux notes, deux lecteurs : le faux de `useAudioPlayer` les distingue par leur URL, celui du
 * statut par le lecteur qu'on lui passe.
 */
describe("CmvAudioPlayer — une seule note à la fois (#529)", () => {
  const OTHER = "https://s3.test/other.m4a?X-Amz-Date=120000";
  let other = fakePlayer();

  beforeEach(() => {
    other = fakePlayer();
    const otherStatus = { ...status };
    vi.mocked(useAudioPlayer).mockImplementation(
      (source) =>
        (source === OTHER ? other : player) as unknown as ReturnType<typeof useAudioPlayer>,
    );
    vi.mocked(useAudioPlayerStatus).mockImplementation(
      (of) =>
        ((of as unknown) === other ? otherStatus : status) as unknown as ReturnType<
          typeof useAudioPlayerStatus
        >,
    );
  });

  function renderBoth(resolveUrl = vi.fn(async (): Promise<string | null> => FRESH)) {
    const element = () => (
      <>
        <CmvAudioPlayer url={FIRST} durationSeconds={90} resolveUrl={resolveUrl} />
        <CmvAudioPlayer url={OTHER} durationSeconds={90} resolveUrl={resolveUrl} />
      </>
    );
    const view = renderRn(element());
    // Le statut de la première note évolue hors de React : on le pousse, puis on redessine.
    const push = (next: Partial<Status>) => {
      setStatus(next);
      view.rerender(element());
    };
    return { ...view, push };
  }

  it("met en pause la note qui joue quand une autre démarre", async () => {
    const view = renderBoth();
    const [first, second] = playButtons(view.container);
    press(first as Element);
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    view.push({ playing: true, currentTime: 12 });

    press(second as Element);

    await waitFor(() => expect(other.play).toHaveBeenCalledTimes(1));
    expect(player.pause).toHaveBeenCalledTimes(1);
  });

  // Coupée pendant qu'elle se re-signait, elle rend son lecteur : rien ne la relance au chargement.
  it("ne relance pas au chargement une note coupée pendant sa reprise", async () => {
    const view = renderBoth();
    const [first, second] = playButtons(view.container);
    press(first as Element);
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    player.play.mockClear();
    player.currentTime = 42;
    view.push({ currentTime: 42, isLoaded: false, error: "403" });
    await waitFor(() => expect(player.replace).toHaveBeenCalledWith(FRESH));

    press(second as Element);
    view.push({ isLoaded: true, error: null });

    await waitFor(() => expect(other.play).toHaveBeenCalledTimes(1));
    expect(player.play).not.toHaveBeenCalled();
  });
});

/**
 * Un lecteur natif crée une session média Android, et Android en plafonne le nombre à 100 par
 * application : au-delà, `AudioPlayer.constructor` lève et l'app tombe (#712). La note ne construit
 * donc le sien qu'à l'engagement — lecture, saut du curseur, désignation par la liste — et le rend
 * quand une autre note prend la main.
 */
describe("CmvAudioPlayer — un lecteur natif seulement à l'engagement (#712)", () => {
  const OTHER = "https://s3.test/other.m4a?X-Amz-Date=120000";
  let other = fakePlayer();
  // Les lecteurs vivants : une source y entre au montage de son hook, et en sort à son démontage.
  let alive = new Set<string>();

  beforeEach(() => {
    other = fakePlayer();
    alive = new Set();
    vi.mocked(useAudioPlayer).mockImplementation((source) => {
      useEffect(() => {
        alive.add(String(source));
        return () => {
          alive.delete(String(source));
        };
      }, [source]);
      return (source === OTHER ? other : player) as unknown as ReturnType<typeof useAudioPlayer>;
    });
    vi.mocked(useAudioPlayerStatus).mockImplementation(
      (of) =>
        ((of as unknown) === other ? { ...status } : status) as unknown as ReturnType<
          typeof useAudioPlayerStatus
        >,
    );
  });

  it("ne construit aucun lecteur pour une note qu'on n'a pas touchée", () => {
    const { getByText } = setup();

    expect(useAudioPlayer).not.toHaveBeenCalled();
    expect(getByText("1:30")).toBeTruthy();
  });

  // Le plafond d'Android : 150 notes rendues d'un coup ne créent aucune session.
  it("ne construit aucun lecteur pour cent cinquante notes rendues", () => {
    renderRn(
      <View>
        {Array.from({ length: 150 }, (_, index) => (
          <CmvAudioPlayer
            key={index}
            url={`${FIRST}&n=${index}`}
            durationSeconds={90}
            resolveUrl={vi.fn()}
          />
        ))}
      </View>,
    );

    expect(useAudioPlayer).not.toHaveBeenCalled();
  });

  it("construit le lecteur au premier appui, sur l'URL de la note, et la lance", async () => {
    const { container } = setup();

    press(playButton(container));

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(vi.mocked(useAudioPlayer).mock.calls[0]?.[0]).toBe(FIRST);
    // Une note neuve part sans saut : seul un point laissé en demande un.
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  // Déplacer le curseur d'une note au repos ne fait que poser d'où elle jouera.
  it("ne construit aucun lecteur au saut du curseur, et joue ensuite du point visé", async () => {
    stubLayoutWidth(200);
    const view = setup();
    await flushLayout();
    const zone = view.getByRole("slider").firstElementChild;
    if (zone == null) throw new Error("zone tactile introuvable");

    tap(zone, 100);
    expect(useAudioPlayer).not.toHaveBeenCalled();
    expect(view.getByText("0:45")).toBeTruthy();
    press(playButton(view.container));

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(45);
  });

  it("construit le lecteur d'une note que la liste désigne, et la lance au début", async () => {
    const view = setup(undefined, listedCue());

    view.cueWith(listedCue(true));

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(0);
  });

  function renderBoth() {
    // Une re-signature qui n'aboutit pas : ces cas ne parlent pas de l'URL.
    const resolveUrl = vi.fn(() => new Promise<string | null>(() => {}));
    const element = () => (
      <>
        <CmvAudioPlayer url={FIRST} durationSeconds={90} resolveUrl={resolveUrl} />
        <CmvAudioPlayer url={OTHER} durationSeconds={90} resolveUrl={resolveUrl} />
      </>
    );
    const view = renderRn(element());
    // Le statut de la première note évolue hors de React : on le pousse, puis on redessine.
    const push = (next: Partial<Status>) => {
      setStatus(next);
      view.rerender(element());
    };
    return { ...view, push };
  }

  it("rend le lecteur d'une note quand une autre démarre", async () => {
    const view = renderBoth();
    const [first, second] = playButtons(view.container);
    press(first as Element);
    await waitFor(() => expect(alive).toEqual(new Set([FIRST])));

    press(second as Element);

    await waitFor(() => expect(alive).toEqual(new Set([OTHER])));
  });

  // La note rendue repart d'où on l'a laissée, pas de zéro (#304, #536).
  it("reprend une note rendue à la position où on l'a laissée", async () => {
    const view = renderBoth();
    const [first, second] = playButtons(view.container);
    press(first as Element);
    await waitFor(() => expect(alive).toEqual(new Set([FIRST])));
    player.currentTime = 12;
    setStatus({ playing: true, currentTime: 12 });
    press(second as Element);
    await waitFor(() => expect(alive).toEqual(new Set([OTHER])));
    player.seekTo.mockClear();
    player.play.mockClear();
    setStatus({ playing: false, currentTime: 0 });

    press(playButtons(view.container)[0] as Element);

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).toHaveBeenCalledWith(12);
  });

  it("repart du début une note menée au bout, quand on la rend puis la relance", async () => {
    const view = renderBoth();
    const [first, second] = playButtons(view.container);
    press(first as Element);
    await waitFor(() => expect(alive).toEqual(new Set([FIRST])));
    player.currentTime = 90;
    view.push({ playing: false, currentTime: 90, didJustFinish: true });
    press(second as Element);
    await waitFor(() => expect(alive).toEqual(new Set([OTHER])));
    player.seekTo.mockClear();
    player.play.mockClear();
    view.push({ didJustFinish: false, currentTime: 0 });

    press(playButtons(view.container)[0] as Element);

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  // Cassée avant d'être rendue, le lecteur retombe à zéro : la note garde pourtant sa position.
  it("garde la position d'une note cassée qu'on rend avant sa reprise", async () => {
    const view = renderBoth();
    const [first, second] = playButtons(view.container);
    press(first as Element);
    await waitFor(() => expect(alive).toEqual(new Set([FIRST])));
    player.currentTime = 42;
    view.push({ playing: false, currentTime: 42, isLoaded: false, error: "403" });
    player.currentTime = 0;
    press(second as Element);
    await waitFor(() => expect(alive).toEqual(new Set([OTHER])));
    player.seekTo.mockClear();
    view.push({ playing: false, currentTime: 0, isLoaded: true, error: null });

    press(playButtons(view.container)[0] as Element);

    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(42));
  });

  // Rendue pendant que son réessai attend une URL, elle n'a plus de lecteur à recharger.
  it("ne recharge pas le lecteur d'une note rendue pendant son réessai", async () => {
    let settle: (url: string) => void = () => {};
    const resolveUrl = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(
        () =>
          new Promise<string | null>((resolve) => {
            settle = resolve;
          }),
      );
    const view = await engaged(resolveUrl);
    view.push({ isLoaded: false, error: "403" });
    await view.untilUnavailable();
    press(playButton(view.container));
    await waitFor(() => expect(resolveUrl).toHaveBeenCalledTimes(2));

    view.unmount();
    await act(async () => settle(FRESH));

    expect(player.replace).not.toHaveBeenCalled();
  });
});
