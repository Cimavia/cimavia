import { fireEvent, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/feature/message/component/Composer";
import { press, renderRn } from "@/test/render";

/**
 * Seul `CmvAudioRecorder` est remplacé : le vrai ne bascule jamais en enregistrement sans pont
 * natif, donc l'état « micro ouvert » de la barre serait hors d'atteinte. Le double garde l'icône
 * du micro au repos, et la presser annonce un enregistrement en cours.
 */
vi.mock("@/shared/component/CmvAudioRecorder", () => ({
  CmvAudioRecorder: ({
    onRecordingChange,
  }: {
    onRecordingChange?: (recording: boolean) => void;
  }) => (
    <button type="button" onClick={() => onRecordingChange?.(true)}>
      <span data-icon="mic-outline" />
    </button>
  ),
}));

const base = {
  onSendText: vi.fn().mockResolvedValue(undefined),
  onPickMedia: vi.fn(),
  onRecordAudio: vi.fn(),
  onMediaError: vi.fn(),
  sending: false,
  mediaBusy: false,
  step: null,
};

/** Les boutons de la barre n'ont que leur icône pour se distinguer. */
function iconButton(container: HTMLElement, name: string): Element | null {
  return container.querySelector(`[data-icon="${name}"]`)?.parentElement ?? null;
}

function type(container: HTMLElement, value: string): void {
  const field = container.querySelector("textarea, input");
  if (field == null) throw new Error("champ de saisie introuvable");
  fireEvent.change(field, { target: { value } });
}

function pressSend(container: HTMLElement): void {
  const send = iconButton(container, "send");
  if (send == null) throw new Error("bouton d'envoi absent");
  press(send);
}

describe("Composer", () => {
  it("n'offre l'envoi qu'une fois quelque chose écrit", () => {
    const { container } = renderRn(<Composer {...base} />);
    expect(iconButton(container, "send")).toBeNull();

    type(container, "salut");

    expect(iconButton(container, "send")).not.toBeNull();
  });

  it("ne prend pas des espaces pour un message", () => {
    const { container } = renderRn(<Composer {...base} />);
    type(container, "   ");
    expect(iconButton(container, "send")).toBeNull();
  });

  it("envoie le texte détouré, puis vide le champ au succès", async () => {
    const onSendText = vi.fn().mockResolvedValue(undefined);
    const { container } = renderRn(<Composer {...base} onSendText={onSendText} />);

    type(container, "  bien joué  ");
    pressSend(container);

    expect(onSendText).toHaveBeenCalledWith("bien joué");
    await waitFor(() =>
      expect(container.querySelector("textarea, input")).toHaveProperty("value", ""),
    );
  });

  // #339 : un réseau coupé vidait le champ, et la ligne d'erreur ne rendait pas le texte.
  it("garde le texte quand l'envoi échoue", async () => {
    const onSendText = vi.fn().mockRejectedValue(new Error("réseau"));
    const { container } = renderRn(<Composer {...base} onSendText={onSendText} />);

    type(container, "cinq lignes de consignes");
    pressSend(container);

    await waitFor(() => expect(onSendText).toHaveBeenCalledOnce());
    expect(container.querySelector("textarea, input")).toHaveProperty(
      "value",
      "cinq lignes de consignes",
    );
  });

  it("retient l'envoi tant que le précédent part encore", () => {
    const { container } = renderRn(<Composer {...base} sending />);
    type(container, "salut");
    // Le micro reprend la place du bouton d'envoi : rien à presser deux fois.
    expect(iconButton(container, "send")).toBeNull();
    expect(iconButton(container, "mic-outline")).not.toBeNull();
  });

  it("ferme la pièce jointe pendant un envoi de média", () => {
    const onPickMedia = vi.fn();
    const { container } = renderRn(<Composer {...base} mediaBusy onPickMedia={onPickMedia} />);

    const attach = iconButton(container, "add-circle-outline");
    if (attach == null) throw new Error("bouton de pièce jointe absent");
    press(attach);

    expect(onPickMedia).not.toHaveBeenCalled();
  });

  it("ne montre l'avancement que pendant un envoi de média", () => {
    const { queryByText, rerender } = renderRn(<Composer {...base} />);
    expect(queryByText("messages.media.uploading")).toBeNull();
    rerender(<Composer {...base} mediaBusy />);
    expect(queryByText("messages.media.uploading")).not.toBeNull();
  });

  it("ne dit le rang du lot que s'il y a un rang à dire", () => {
    const { queryByText, rerender } = renderRn(
      <Composer
        {...base}
        mediaBusy
        step={{ index: 1, total: 1, fileName: "a.jpg", continuesBatch: false }}
      />,
    );
    expect(queryByText("messages.media.batchProgress")).toBeNull();
    expect(queryByText("messages.media.uploading")).not.toBeNull();

    rerender(
      <Composer
        {...base}
        mediaBusy
        step={{ index: 2, total: 3, fileName: "a.jpg", continuesBatch: true }}
      />,
    );

    expect(queryByText("messages.media.batchProgress")).not.toBeNull();
    expect(queryByText("messages.media.uploading")).toBeNull();
  });

  /** Micro ouvert : la barre lui laisse toute la place, ni pièce jointe ni saisie par-dessus. */
  it("s'efface derrière le micro pendant un enregistrement", () => {
    const { container } = renderRn(<Composer {...base} />);

    press(iconButton(container, "mic-outline") as Element);

    expect(iconButton(container, "add-circle-outline")).toBeNull();
    expect(container.querySelector("textarea, input")).toBeNull();
    expect(iconButton(container, "mic-outline")).not.toBeNull();
  });

  /** Un fichier sans nom se nomme quand même : la ligne d'avancement ne laisse pas de trou. */
  it("nomme le fichier en cours d'envoi, même sans nom d'origine", () => {
    const i18n = createInstance();
    i18n.init({
      lng: "test",
      resources: {
        test: {
          translation: {
            messages: {
              media: { batchProgress: "{{index}}/{{total}} {{fileName}}", unnamedFile: "sans nom" },
            },
          },
        },
      },
      interpolation: { escapeValue: false },
    });
    const { queryByText } = renderRn(
      <I18nextProvider i18n={i18n}>
        <Composer
          {...base}
          mediaBusy
          step={{ index: 2, total: 3, fileName: null, continuesBatch: true }}
        />
      </I18nextProvider>,
    );

    expect(queryByText("2/3 sans nom")).not.toBeNull();
  });
});
