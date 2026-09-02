import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { Composer } from "./Composer";

const { recorderMock } = vi.hoisted(() => ({ recorderMock: vi.fn() }));

/**
 * L'enregistreur est coupé : il ouvre le micro via `MediaRecorder`, que jsdom n'a pas, et ses
 * refus (permission, format non produit) ont leurs propres tests. Ce qui se vérifie ici est la
 * barre d'envoi — texte, pièces jointes, et ce qu'elle dit pendant un lot.
 */
vi.mock("@/shared/hook/useWebAudioRecorder", () => ({
  useWebAudioRecorder: () => recorderMock(),
}));

vi.mock("@/shared/component", () => ({ useToast: () => ({ error: vi.fn() }) }));

const props = () => ({
  onSendText: vi.fn(),
  onSendFiles: vi.fn(),
  onRecordedAudio: vi.fn(),
  sending: false,
  mediaBusy: false,
  progress: 0,
  step: null,
});

const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

beforeEach(() => {
  vi.clearAllMocks();
  recorderMock.mockReturnValue({
    isAvailable: true,
    isRecording: false,
    seconds: 0,
    start: vi.fn(),
    stop: vi.fn(),
  });
});

describe("Composer", () => {
  it("remonte TOUTE la sélection en un seul appel", async () => {
    const given = props();
    const { container, user } = renderWithProviders(<Composer {...given} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (input == null) throw new Error("pas de sélecteur de fichier");

    await user.upload(input, [photo("a.jpg"), photo("b.jpg"), photo("c.jpg")]);

    // Un seul appel avec les trois fichiers, et non trois appels : c'est le lot qui décide
    // ensuite de ce qui part, pas le composer.
    expect(given.onSendFiles).toHaveBeenCalledOnce();
    expect(given.onSendFiles.mock.calls[0]?.[0]).toHaveLength(3);
  });

  it("laisse re-choisir le même fichier après un refus", async () => {
    const given = props();
    const { container, user } = renderWithProviders(<Composer {...given} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (input == null) throw new Error("pas de sélecteur de fichier");

    await user.upload(input, [photo("a.jpg")]);

    // La valeur est vidée tout de suite : sans ça, re-choisir le MÊME fichier ne déclencherait
    // aucun `change`, et l'utilisateur croirait le bouton mort.
    expect(input.value).toBe("");
  });

  it("ne remonte rien quand la sélection est annulée", async () => {
    const given = props();
    const { container, user } = renderWithProviders(<Composer {...given} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (input == null) throw new Error("pas de sélecteur de fichier");

    await user.upload(input, []);

    expect(given.onSendFiles).not.toHaveBeenCalled();
  });

  it("nomme le fichier en cours quand le lot en compte plusieurs", () => {
    const { getByText } = renderWithProviders(
      <Composer
        {...props()}
        mediaBusy
        progress={40}
        step={{ index: 2, total: 5, fileName: "voie.mp4" }}
      />,
    );

    expect(getByText("messages.media.batchProgress")).toBeInTheDocument();
  });

  it("tait le rang sur un fichier seul, où « 1 / 1 » ne serait que du bruit", () => {
    const { queryByText, getByText } = renderWithProviders(
      <Composer
        {...props()}
        mediaBusy
        progress={40}
        step={{ index: 1, total: 1, fileName: "voie.mp4" }}
      />,
    );

    expect(queryByText("messages.media.batchProgress")).not.toBeInTheDocument();
    expect(getByText("messages.media.uploading")).toBeInTheDocument();
  });

  it("envoie le texte sur Entrée et saute une ligne sur Maj+Entrée", async () => {
    const given = props();
    const { getByPlaceholderText, user } = renderWithProviders(<Composer {...given} />);
    const field = getByPlaceholderText("messages.placeholder");

    await user.type(field, "salut{Shift>}{Enter}{/Shift}");
    expect(given.onSendText).not.toHaveBeenCalled();

    await user.type(field, "{Enter}");
    expect(given.onSendText).toHaveBeenCalledWith("salut");
  });
});
