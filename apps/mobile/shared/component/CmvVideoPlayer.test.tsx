import * as Sentry from "@sentry/react-native";
import { act, screen, waitFor } from "@testing-library/react";
import { getNetworkStateAsync, NetworkStateType } from "expo-network";
import { useVideoPlayer, VideoView } from "expo-video";
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { useVideoThumbnail } from "@/shared/hook/useVideoThumbnail";
import { press, renderRn } from "@/test/render";
import { CmvVideoPlayer } from "./CmvVideoPlayer";

// Le tirage est éprouvé dans `video-thumbnail.test.ts` : ici, seul compte ce qu'on en affiche.
vi.mock("@/shared/hook/useVideoThumbnail", () => ({
  useVideoThumbnail: vi.fn((): string | null => null),
}));

const THUMB = "file:///cache/video-thumbnails/msg-1.jpg";

const FIRST = "https://s3.test/voie.mp4?X-Amz-Date=120000";
const POLLED = "https://s3.test/voie.mp4?X-Amz-Date=120010";
const FRESH = "https://s3.test/voie.mp4?X-Amz-Date=121000";

// 90 s à 64 Mbit/s : un original de caméra, tel que mesuré en #809.
const SIZE = 720_000_000;

// Le faux de `test/native.tsx`, vu par ce qu'un test en interroge.
type FakePlayer = {
  play: Mock;
  replaceAsync: Mock;
  addListener: Mock;
  currentTime: number;
};

type Resolve = () => Promise<string | null>;

function setup(resolveUrl: Resolve = vi.fn(async () => FIRST)) {
  const element = (resolver: Resolve) => (
    <CmvVideoPlayer mediaId="msg-1" durationSeconds={90} sizeBytes={SIZE} resolveUrl={resolver} />
  );
  const view = renderRn(element(resolveUrl));
  const pill = () => {
    const icon = view.container.querySelector('[data-icon="play-circle"]');
    if (icon?.parentElement == null) throw new Error("pastille vidéo introuvable");
    return icon.parentElement;
  };
  /**
   * Un lecteur ouvert ET écouté. Voir le Modal (rendu en PORTAIL, hors de `container`) ne suffit
   * pas : l'abonnement à `statusChange` vit dans un effet PASSIF, que React peut n'avoir pas encore
   * joué quand `waitFor` rend la main — sur une machine chargée, `emit` ne trouvait aucun écouteur.
   */
  const open = async () => {
    press(pill());
    await waitFor(() => expect(videoView()).not.toBeNull());
    await waitFor(() => expect(player().addListener).toHaveBeenCalled());
  };
  return {
    ...view,
    resolveUrl,
    pill,
    open,
    rerenderWith: (r: Resolve) => view.rerender(element(r)),
  };
}

function videoView() {
  return document.querySelector("[data-video-view]");
}

// Le lecteur que le composant tient — stable d'un rendu à l'autre, comme le vrai.
function player(): FakePlayer {
  const created = vi.mocked(useVideoPlayer).mock.results.at(-1);
  if (created == null) throw new Error("aucun lecteur créé");
  return created.value as unknown as FakePlayer;
}

// Joue un événement natif auprès de TOUS ses écouteurs, comme expo-video : le lecteur en a deux
// sur `statusChange` (la reprise, la mesure de #809).
function dispatch(event: string, payload: object) {
  const listeners = player()
    .addListener.mock.calls.filter(([name]) => name === event)
    .map(([, listener]) => listener as (payload: object) => void);
  if (listeners.length === 0) throw new Error(`aucun écouteur de ${event}`);
  act(() => {
    for (const listener of listeners) listener(payload);
  });
}

// Un changement d'état natif, comme l'événement `statusChange` d'expo-video.
function emit(status: "error" | "readyToPlay" | "loading", message?: string) {
  dispatch("statusChange", { status, ...(message == null ? {} : { error: { message } }) });
}

// Le lecteur joue (ou s'arrête), comme l'événement `playingChange`.
function emitPlaying(isPlaying: boolean) {
  dispatch("playingChange", { isPlaying });
}

// La première image est à l'écran : c'est la VUE qui le dit, par `onFirstFrameRender`.
function firstFrame() {
  const props = vi.mocked(VideoView).mock.calls.at(-1)?.[0] as
    | { onFirstFrameRender?: () => void }
    | undefined;
  if (props?.onFirstFrameRender == null) throw new Error("aucune vue vidéo à l'écoute");
  act(() => props.onFirstFrameRender?.());
}

beforeEach(() => {
  vi.mocked(useVideoThumbnail).mockReturnValue(null);
});

describe("CmvVideoPlayer", () => {
  // Un fil de vingt vidéos ne coûte AUCUN lecteur : seul un Modal ouvert en instancie un.
  it("n'instancie aucun lecteur au repos", () => {
    const { getByText } = setup();

    expect(getByText("media.video.label")).toBeTruthy();
    expect(getByText("1:30")).toBeTruthy();
    expect(useVideoPlayer).not.toHaveBeenCalled();
    expect(videoView()).toBeNull();
  });

  // Durée non mesurée à l'envoi : rien plutôt qu'un « 0:00 » qui mentirait.
  it("n'affiche aucune durée quand elle est inconnue", () => {
    const { container, getByText } = renderRn(
      <CmvVideoPlayer
        mediaId="msg-1"
        durationSeconds={null}
        sizeBytes={null}
        resolveUrl={vi.fn(async () => FIRST)}
      />,
    );

    expect(getByText("media.video.label")).toBeTruthy();
    expect(container.textContent).toBe("media.video.label");
  });

  it("ouvre en plein écran sur l'URL vérifiée, et lance la lecture", async () => {
    const { open, resolveUrl } = setup();

    await open();

    expect(resolveUrl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(useVideoPlayer).mock.calls[0]?.[0]).toBe(FIRST);
    expect(player().play).toHaveBeenCalledTimes(1);
  });

  // Une URL périmée ouverte telle quelle donnerait un lecteur noir, sans un mot.
  it("n'ouvre rien et le dit quand l'URL ne peut pas être re-signée", async () => {
    const { pill, findByText } = setup(vi.fn(async () => null));

    press(pill());

    expect(await findByText("media.video.refreshError")).toBeTruthy();
    expect(useVideoPlayer).not.toHaveBeenCalled();
  });

  it("traite un résolveur qui lève comme une re-signature impossible", async () => {
    const { pill, findByText } = setup(vi.fn(async () => Promise.reject(new Error("réseau"))));

    press(pill());

    expect(await findByText("media.video.refreshError")).toBeTruthy();
    expect(videoView()).toBeNull();
  });

  /**
   * #304 : le fil est sondé toutes les 10 s et chaque réponse porte une URL neuve. Le lecteur
   * ouvert garde celle avec laquelle il a démarré — en changer relancerait la vidéo à zéro.
   */
  it("garde sa source de départ quand l'écran se redessine avec un nouveau résolveur", async () => {
    const { open, rerenderWith } = setup();
    await open();
    const opened = player();

    rerenderWith(vi.fn(async () => POLLED));

    expect(player()).toBe(opened);
    expect(vi.mocked(useVideoPlayer).mock.calls.every(([source]) => source === FIRST)).toBe(true);
    expect(opened.replaceAsync).not.toHaveBeenCalled();
  });

  it("se ferme sur le bouton dédié, et relâche son lecteur", async () => {
    const { open } = setup();
    await open();
    const subscriptions = player().addListener.mock.results.map(
      (result) => result.value as { remove: Mock },
    );

    press(screen.getByLabelText("media.video.close"));

    await waitFor(() => expect(videoView()).toBeNull());
    for (const subscription of subscriptions) expect(subscription.remove).toHaveBeenCalled();
  });

  /**
   * V-3 : en pause au-delà du TTL, la reprise redemande des octets sur une URL expirée et le
   * storage répond 403. On re-signe, et la vidéo repart là où elle en était.
   */
  it("re-signe une lecture cassée en route et la reprend à la même position", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => FIRST);
    const { open } = setup(resolveUrl);
    await open();
    resolveUrl.mockResolvedValue(FRESH);
    player().currentTime = 42;

    emit("error");
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledWith(FRESH));
    player().currentTime = 0;
    player().play.mockClear();
    emit("readyToPlay");

    expect(player().currentTime).toBe(42);
    expect(player().play).toHaveBeenCalledTimes(1);
    expect(videoView()).not.toBeNull();
  });

  // Prête sans reprise en attente : c'est le chargement initial, rien à déplacer.
  it("ne touche pas à la position quand rien n'était à reprendre", async () => {
    const { open } = setup();
    await open();
    player().currentTime = 7;

    emit("readyToPlay");

    expect(player().currentTime).toBe(7);
  });

  // La même URL, encore valide : l'expiration n'y est pour rien, la relancer bouclerait.
  it("ferme et le dit quand la re-signature rend l'URL qui vient d'échouer", async () => {
    const { open, findByText } = setup();
    await open();

    emit("error");

    expect(await findByText("media.video.openError")).toBeTruthy();
    expect(videoView()).toBeNull();
    expect(player().replaceAsync).not.toHaveBeenCalled();
  });

  it("ferme et le dit quand la re-signature échoue en route", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => FIRST);
    const { open, findByText } = setup(resolveUrl);
    await open();
    resolveUrl.mockResolvedValue(null);

    emit("error");

    expect(await findByText("media.video.openError")).toBeTruthy();
    expect(videoView()).toBeNull();
  });

  it("ferme et le dit quand la nouvelle source refuse de se charger", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => FIRST);
    const { open, findByText } = setup(resolveUrl);
    await open();
    resolveUrl.mockResolvedValue(FRESH);
    player().replaceAsync.mockRejectedValue(new Error("chargement"));

    emit("error");

    expect(await findByText("media.video.openError")).toBeTruthy();
  });

  // Fermé pendant la re-signature : ce lecteur n'existe plus, rien n'est à recharger.
  it("abandonne la reprise quand le lecteur est fermé pendant la re-signature", async () => {
    let finish: (url: string | null) => void = () => undefined;
    const resolveUrl = vi.fn(async (): Promise<string | null> => FIRST);
    const { open, queryByText } = setup(resolveUrl);
    await open();
    const opened = player();
    resolveUrl.mockImplementation(() => new Promise((resolve) => (finish = resolve)));

    emit("error");
    press(screen.getByLabelText("media.video.close"));
    await waitFor(() => expect(videoView()).toBeNull());
    await act(async () => finish(null));

    expect(opened.replaceAsync).not.toHaveBeenCalled();
    expect(queryByText("media.video.openError")).toBeNull();
  });

  // Même chose quand c'est le chargement qui échoue après la fermeture : personne n'attend plus.
  it("tait un échec de chargement survenu après la fermeture", async () => {
    let reject: (error: Error) => void = () => undefined;
    const resolveUrl = vi.fn(async (): Promise<string | null> => FIRST);
    const { open, queryByText } = setup(resolveUrl);
    await open();
    resolveUrl.mockResolvedValue(FRESH);
    player().replaceAsync.mockImplementation(() => new Promise((_, fail) => (reject = fail)));

    emit("error");
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalled());
    press(screen.getByLabelText("media.video.close"));
    await waitFor(() => expect(videoView()).toBeNull());
    await act(async () => reject(new Error("chargement")));

    expect(queryByText("media.video.openError")).toBeNull();
  });

  // Un nouvel essai efface l'échec précédent : le message ne survit pas à ce qu'il décrivait.
  it("efface le message d'échec à la tentative suivante", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => null);
    const { pill, findByText, queryByText } = setup(resolveUrl);
    press(pill());
    await findByText("media.video.refreshError");
    resolveUrl.mockResolvedValue(FIRST);

    // Appui retenté : `react-native-web` ne relit `disabled` que dans un effet PASSIF, qui peut
    // n'avoir pas encore tourné quand le message s'affiche — sur une machine chargée, le clic
    // tombait sur un `Pressable` encore désactivé et était ignoré sans bruit. `resolveUrl` est
    // appelé dans le même tour que l'appui : le second appel prouve qu'il a été pris.
    await waitFor(() => {
      press(pill());
      expect(resolveUrl).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => expect(videoView()).not.toBeNull());
    expect(queryByText("media.video.refreshError")).toBeNull();
  });
});

describe("CmvVideoPlayer — vignette", () => {
  beforeEach(() => {
    vi.mocked(useVideoThumbnail).mockReturnValue(THUMB);
  });

  it("montre la vignette, son bouton de lecture et la durée, à la place de la pastille", () => {
    const { container, getByLabelText, getByText } = setup();

    expect(container.querySelector("img")?.getAttribute("src")).toBe(THUMB);
    expect(container.querySelector('[data-icon="play"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="play-circle"]')).toBeNull();
    expect(getByLabelText("media.video.label")).toBeTruthy();
    expect(getByText("1:30")).toBeTruthy();
    expect(useVideoThumbnail).toHaveBeenCalledWith("msg-1", expect.any(Function), 90);
  });

  // Même règle que la pastille : pas de badge « 0:00 » pour une durée inconnue.
  it("n'affiche aucun badge de durée quand elle est inconnue", () => {
    const { container } = renderRn(
      <CmvVideoPlayer
        mediaId="msg-1"
        durationSeconds={null}
        sizeBytes={null}
        resolveUrl={vi.fn(async () => FIRST)}
      />,
    );

    expect(container.querySelector("img")).not.toBeNull();
    expect(container.textContent).toBe("");
  });

  it("ouvre le plein écran au tap sur la vignette", async () => {
    const { getByLabelText, resolveUrl } = setup();

    press(getByLabelText("media.video.label"));

    await waitFor(() => expect(videoView()).not.toBeNull());
    expect(resolveUrl).toHaveBeenCalledTimes(1);
  });

  // Le temps de la re-signature, le bouton de lecture devient un indicateur.
  it("remplace le bouton de lecture par un indicateur pendant l'ouverture", async () => {
    const { container, getByLabelText } = setup(
      vi.fn(() => new Promise<string | null>(() => undefined)),
    );

    press(getByLabelText("media.video.label"));

    await waitFor(() => expect(container.querySelector('[data-icon="play"]')).toBeNull());
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it("dit l'échec sous la vignette comme sous la pastille", async () => {
    const { getByLabelText, findByText } = setup(vi.fn(async () => null));

    press(getByLabelText("media.video.label"));

    expect(await findByText("media.video.refreshError")).toBeTruthy();
  });
});

describe("CmvVideoPlayer — remontée à Sentry (#809)", () => {
  it("remonte ce que le natif a répondu, avec l'hôte de la vidéo", async () => {
    const { open } = setup();
    await open();

    emit("error", "Response code: 403");

    await waitFor(() => expect(Sentry.captureMessage).toHaveBeenCalledTimes(1));
    expect(Sentry.captureMessage).toHaveBeenCalledWith("Lecture d'une vidéo échouée", {
      level: "error",
      tags: { platform: "web", host: "s3.test" },
      extra: { nativeMessage: "Response code: 403" },
    });
  });

  it("n'emporte jamais l'URL signée que le natif cite", async () => {
    const { open } = setup();
    await open();

    emit("error", `Source error: ${FIRST}`);

    await waitFor(() => expect(Sentry.captureMessage).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(vi.mocked(Sentry.captureMessage).mock.calls)).not.toContain("X-Amz");
  });

  it("remonte une panne sans message natif, en le disant absent", async () => {
    const { open } = setup();
    await open();

    emit("error");

    await waitFor(() =>
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        "Lecture d'une vidéo échouée",
        expect.objectContaining({ extra: { nativeMessage: null } }),
      ),
    );
  });

  // V-3 : un 403 après 5 min de pause est la routine du TTL, la re-signature le rattrape.
  it("ne remonte pas une panne rattrapée par la re-signature", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => FIRST);
    const { open } = setup(resolveUrl);
    await open();
    resolveUrl.mockResolvedValue(FRESH);

    emit("error", "Response code: 403");
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledWith(FRESH));

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("remonte la panne quand la nouvelle source refuse de se charger", async () => {
    const resolveUrl = vi.fn(async (): Promise<string | null> => FIRST);
    const { open, findByText } = setup(resolveUrl);
    await open();
    resolveUrl.mockResolvedValue(FRESH);
    player().replaceAsync.mockRejectedValue(new Error("chargement"));

    emit("error", "Response code: 403");

    expect(await findByText("media.video.openError")).toBeTruthy();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Lecture d'une vidéo échouée",
      expect.objectContaining({ tags: { platform: "web", host: "s3.test" } }),
    );
  });

  it("ne remonte rien tant que la lecture ne casse pas", async () => {
    const { open } = setup();
    await open();

    emit("readyToPlay");

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

/**
 * #809 : une lecture lente remonte ce qu'elle a coûté, avec le réseau et le débit de la vidéo. Ce
 * qui est « lent » se décide dans `videoPlaybackReport` (éprouvé dans `@cmv/shared`) : ici, seul
 * compte que le lecteur relaie les bons instants et envoie le rapport à la fermeture.
 */
describe("CmvVideoPlayer — lecture lente (#809)", () => {
  let now = 0;
  const at = (ms: number) => {
    now = ms;
  };

  beforeEach(() => {
    now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.mocked(Date.now).mockRestore();
  });

  const closePlayer = async () => {
    press(screen.getByLabelText("media.video.close"));
    await waitFor(() => expect(videoView()).toBeNull());
  };

  const slowReports = () =>
    vi
      .mocked(Sentry.captureMessage)
      .mock.calls.filter(([title]) => title === "Lecture d'une vidéo lente");
  const slowTags = () =>
    (slowReports()[0]?.[1] as { tags?: Record<string, string> } | undefined)?.tags;

  it("remonte un démarrage lent, compté depuis le geste, avec le débit et le réseau", async () => {
    vi.mocked(getNetworkStateAsync).mockResolvedValueOnce({
      type: NetworkStateType.CELLULAR,
      isConnected: true,
      isInternetReachable: true,
    });
    const { open } = setup();
    await open();
    at(8000);
    firstFrame();
    at(30_000);

    await closePlayer();

    await waitFor(() => expect(slowReports()).toHaveLength(1));
    expect(slowReports()[0]?.[1]).toEqual({
      level: "warning",
      tags: { platform: "web", network: "cellular", started: "true" },
      extra: { startupMs: 8000, started: true, stallCount: 0, stallMs: 0, bitrateMbps: 64 },
    });
  });

  it("compte les recharges d'une lecture partie vite", async () => {
    const { open } = setup();
    await open();
    at(500);
    firstFrame();
    at(4000);
    emit("loading");
    at(7000);
    emit("readyToPlay");
    at(9000);

    await closePlayer();

    await waitFor(() => expect(slowReports()).toHaveLength(1));
    expect(slowReports()[0]?.[1]).toMatchObject({
      extra: { startupMs: 500, stallCount: 1, stallMs: 3000 },
    });
  });

  // Le réseau inconnu ne s'invente pas : pas de tag, plutôt qu'un « unknown » qui passerait pour
  // une valeur.
  it("remonte une vidéo fermée avant sa première image, sans réseau quand il est inconnu", async () => {
    const { open } = setup();
    await open();
    at(12_000);

    await closePlayer();

    await waitFor(() => expect(slowReports()).toHaveLength(1));
    expect(slowReports()[0]?.[1]).toMatchObject({
      tags: { platform: "web", started: "false" },
      extra: { startupMs: 12_000, started: false },
    });
    expect(slowTags()).not.toHaveProperty("network");
  });

  it("n'invente pas de réseau quand le système ne répond pas", async () => {
    vi.mocked(getNetworkStateAsync).mockRejectedValueOnce(new Error("indisponible"));
    const { open } = setup();
    await open();
    at(12_000);

    await closePlayer();

    await waitFor(() => expect(slowReports()).toHaveLength(1));
    expect(slowTags()).not.toHaveProperty("network");
  });

  // Lu à l'ouverture : passer en wifi pour fermer ne réécrit pas le lien qui a fait attendre.
  it("garde le réseau de l'ouverture, pas celui de la fermeture", async () => {
    vi.mocked(getNetworkStateAsync)
      .mockResolvedValueOnce({ type: NetworkStateType.CELLULAR })
      .mockResolvedValue({ type: NetworkStateType.WIFI });
    const { open } = setup();
    await open();
    at(12_000);

    await closePlayer();

    await waitFor(() => expect(slowReports()).toHaveLength(1));
    expect(slowReports()[0]?.[1]).toMatchObject({ tags: { network: "cellular" } });
  });

  // La lecture reprise (`playingChange`) ferme une recharge comme l'état « prêt ».
  it("ferme une recharge à la reprise de la lecture", async () => {
    const { open } = setup();
    await open();
    at(500);
    firstFrame();
    at(4000);
    emit("loading");
    at(6000);
    emitPlaying(true);
    at(60_000);

    await closePlayer();

    await waitFor(() => expect(slowReports()).toHaveLength(1));
    expect(slowReports()[0]?.[1]).toMatchObject({ extra: { stallCount: 1, stallMs: 2000 } });
  });

  // `playingChange` dit que la lecture est DEMANDÉE ou reprise, pas qu'une image est à l'écran.
  it("ne prend pas la lecture lancée pour sa première image", async () => {
    const { open } = setup();
    await open();
    at(100);
    emitPlaying(true);
    at(9000);
    firstFrame();
    at(20_000);

    await closePlayer();

    await waitFor(() => expect(slowReports()).toHaveLength(1));
    expect(slowReports()[0]?.[1]).toMatchObject({ extra: { startupMs: 9000, started: true } });
  });

  it("ne remonte rien d'une lecture fluide", async () => {
    const { open } = setup();
    await open();
    at(1200);
    firstFrame();
    emitPlaying(true);
    emitPlaying(false);
    at(60_000);

    await closePlayer();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
