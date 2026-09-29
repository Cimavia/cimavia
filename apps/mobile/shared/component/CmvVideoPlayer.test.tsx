import { act, screen, waitFor } from "@testing-library/react";
import { useVideoPlayer } from "expo-video";
import { describe, expect, it, type Mock, vi } from "vitest";
import { press, renderRn } from "@/test/render";
import { CmvVideoPlayer } from "./CmvVideoPlayer";

const FIRST = "https://s3.test/voie.mp4?X-Amz-Date=120000";
const POLLED = "https://s3.test/voie.mp4?X-Amz-Date=120010";
const FRESH = "https://s3.test/voie.mp4?X-Amz-Date=121000";

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
    <CmvVideoPlayer durationSeconds={90} resolveUrl={resolver} />
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

// Joue un changement d'état natif, comme l'événement `statusChange` d'expo-video.
function emit(status: "error" | "readyToPlay") {
  const listener = player().addListener.mock.calls.at(-1)?.[1] as
    | ((payload: { status: string }) => void)
    | undefined;
  if (listener == null) throw new Error("aucun écouteur de statut");
  act(() => listener({ status }));
}

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
      <CmvVideoPlayer durationSeconds={null} resolveUrl={vi.fn(async () => FIRST)} />,
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
    const subscription = player().addListener.mock.results[0]?.value as { remove: Mock };

    press(screen.getByLabelText("media.video.close"));

    await waitFor(() => expect(videoView()).toBeNull());
    expect(subscription.remove).toHaveBeenCalled();
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

    press(pill());

    await waitFor(() => expect(videoView()).not.toBeNull());
    expect(queryByText("media.video.refreshError")).toBeNull();
  });
});
