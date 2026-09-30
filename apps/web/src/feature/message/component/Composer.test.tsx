import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/render";
import { Composer } from "./Composer";

const { recorderMock, toastError } = vi.hoisted(() => ({
  recorderMock: vi.fn(),
  toastError: vi.fn(),
}));

/**
 * L'enregistreur est coupé : il ouvre le micro via `MediaRecorder`, que jsdom n'a pas, et ses
 * refus (permission, format non produit) ont leurs propres tests. Ce qui se vérifie ici est la
 * barre d'envoi — texte, pièces jointes, et ce qu'elle dit pendant un lot.
 */
vi.mock("@/shared/hook/useWebAudioRecorder", () => ({
  useWebAudioRecorder: (options: unknown) => recorderMock(options),
}));

vi.mock("@/shared/component", () => ({ useToast: () => ({ error: toastError }) }));

const props = () => ({
  onSendText: vi.fn(),
  onSendFiles: vi.fn(),
  onRecordedAudio: vi.fn(),
  sending: false,
  mediaBusy: false,
  progress: 0,
  retry: null,
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
    const { container } = renderWithProviders(<Composer {...given} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (input == null) throw new Error("pas de sélecteur de fichier");

    // `user.upload(input, [])` ne déclenche aucun `change` : c'est le navigateur qui rend une
    // sélection vide quand on referme le sélecteur, il faut donc la lui faire rendre.
    fireEvent.change(input, { target: { files: [] } });

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

  it("n'envoie pas un texte vide, ni pendant un envoi en cours", async () => {
    const given = props();
    const { getByPlaceholderText, rerender, user, queryByRole } = renderWithProviders(
      <Composer {...given} />,
    );
    const field = getByPlaceholderText("messages.placeholder");

    await user.type(field, "   {Enter}");
    expect(given.onSendText).not.toHaveBeenCalled();

    rerender(<Composer {...given} sending />);
    await user.type(field, "salut{Enter}");

    expect(given.onSendText).not.toHaveBeenCalled();
    // Sans texte envoyable, la place du bouton d'envoi revient au micro.
    expect(queryByRole("button", { name: "messages.send" })).toBeNull();
  });

  it("envoie le texte au bouton, nettoyé", async () => {
    const given = props();
    const { getByPlaceholderText, getByRole, user } = renderWithProviders(<Composer {...given} />);

    await user.type(getByPlaceholderText("messages.placeholder"), "  salut  ");
    await user.click(getByRole("button", { name: "messages.send" }));

    expect(given.onSendText).toHaveBeenCalledWith("salut");
  });

  it("ouvre le sélecteur de fichiers, et l'éteint pendant un envoi de média", async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const { getByRole, rerender, user } = renderWithProviders(<Composer {...props()} />);

    await user.click(getByRole("button", { name: "messages.attach" }));
    expect(click).toHaveBeenCalledOnce();

    rerender(<Composer {...props()} mediaBusy />);
    expect(getByRole("button", { name: "messages.attach" })).toBeDisabled();
    expect(getByRole("button", { name: "messages.record" })).toBeDisabled();
    click.mockRestore();
  });

  it("démarre une note vocale au micro", async () => {
    const { getByRole, user } = renderWithProviders(<Composer {...props()} />);

    await user.click(getByRole("button", { name: "messages.record" }));

    expect(recorderMock.mock.results[0]?.value.start).toHaveBeenCalled();
  });

  // Pendant l'enregistrement, la barre devient un minuteur : jeter ou envoyer, rien d'autre.
  it("bascule en minuteur pendant l'enregistrement, puis jette ou envoie", async () => {
    const stop = vi.fn();
    recorderMock.mockReturnValue({ isRecording: true, seconds: 75, start: vi.fn(), stop });
    const { getByText, getByRole, queryByPlaceholderText, user } = renderWithProviders(
      <Composer {...props()} />,
    );

    expect(getByText("1:15")).toBeInTheDocument();
    expect(queryByPlaceholderText("messages.placeholder")).toBeNull();

    await user.click(getByRole("button", { name: "common.cancel" }));
    await user.click(getByRole("button", { name: "messages.send" }));

    expect(stop.mock.calls).toEqual([[false], [true]]);
  });

  it("dit le refus du micro", () => {
    renderWithProviders(<Composer {...props()} />);

    recorderMock.mock.lastCall?.[0].onError("messages.audio.permission");

    expect(toastError).toHaveBeenCalledWith("messages.audio.permission");
  });

  // Un réessai PREND la place du pourcentage : « 45 % » se lirait comme un envoi qui avance.
  it("dit le réessai à la place du pourcentage", () => {
    const { getByText, queryByText } = renderWithProviders(
      <Composer
        {...props()}
        mediaBusy
        progress={45}
        retry={{ attempt: 2, maxAttempts: 3 } as never}
      />,
    );

    expect(getByText("messages.media.retrying")).toBeInTheDocument();
    expect(queryByText("messages.media.uploading")).toBeNull();
  });
});
