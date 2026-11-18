import { MESSAGE_TEXT_MAX_LENGTH } from "@cmv/shared";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/feature/message/component/Composer";
import { MESSAGE_AUDIO_NOTES_PER_CAPTURE, MESSAGE_MEDIA_PROFILE } from "@/feature/message/constant";
import { CmvAudioRecorder } from "@/shared/component/CmvAudioRecorder";
import { press, renderRn } from "@/test/render";

/**
 * Seul `CmvAudioRecorder` est remplacé : le vrai ne bascule jamais en enregistrement sans pont
 * natif, donc l'état « micro ouvert » de la barre serait hors d'atteinte. Le double garde l'icône
 * du micro au repos, et la presser annonce un enregistrement en cours.
 */
vi.mock("@/shared/component/CmvAudioRecorder", () => ({
  CmvAudioRecorder: vi.fn(
    ({ onRecordingChange }: { onRecordingChange?: (recording: boolean) => void }) => (
      <button type="button" onClick={() => onRecordingChange?.(true)}>
        <span data-icon="mic-outline" />
      </button>
    ),
  ),
}));

/** Ce que la barre a passé à l'enregistreur à son dernier rendu. */
function recorderProps() {
  const props = vi.mocked(CmvAudioRecorder).mock.lastCall?.[0];
  if (props == null) throw new Error("enregistreur jamais rendu");
  return props;
}

const base = {
  onSendText: vi.fn().mockResolvedValue(undefined),
  onPickMedia: vi.fn(),
  onRecordAudio: vi.fn(),
  onCaptureStart: vi.fn(),
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
  it("borne le message à ce que l'API accepte, et montre le compteur à l'approche (#319)", () => {
    const { container, queryByText } = renderRn(<Composer {...base} />);

    expect(container.querySelector("textarea")?.getAttribute("maxLength")).toBe(
      String(MESSAGE_TEXT_MAX_LENGTH),
    );
    expect(queryByText("common.charCount")).toBeNull();

    type(container, "x".repeat(MESSAGE_TEXT_MAX_LENGTH - 10));

    expect(queryByText("common.charCount")).not.toBeNull();
  });

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

  /** Joindre ouvre d'abord un choix (#771) : la galerie, ou les PDF de l'appareil. */
  it.each([
    ["images-outline", "media"],
    ["document-text-outline", "file"],
  ])("ouvre la source choisie (%s), puis referme le choix", (icon, source) => {
    const onPickMedia = vi.fn();
    const { container } = renderRn(<Composer {...base} onPickMedia={onPickMedia} />);
    expect(iconButton(container, icon)).toBeNull();

    press(iconButton(container, "add-circle-outline") as Element);
    press(iconButton(container, icon) as Element);

    expect(onPickMedia).toHaveBeenCalledWith(source);
    expect(iconButton(container, icon)).toBeNull();
  });

  it("referme le choix au second appui sur joindre, sans rien ouvrir", () => {
    const onPickMedia = vi.fn();
    const { container } = renderRn(<Composer {...base} onPickMedia={onPickMedia} />);
    const attach = iconButton(container, "add-circle-outline") as Element;

    press(attach);
    press(attach);

    expect(iconButton(container, "images-outline")).toBeNull();
    expect(onPickMedia).not.toHaveBeenCalled();
  });

  it("ne rouvre pas le choix à la fin d'un enregistrement lancé par-dessus", () => {
    const { container } = renderRn(<Composer {...base} />);

    press(iconButton(container, "add-circle-outline") as Element);
    press(iconButton(container, "mic-outline") as Element);

    expect(iconButton(container, "images-outline")).toBeNull();
  });

  it("referme le choix quand un envoi démarre : il ne resurgit pas à la fin", () => {
    const { container, rerender } = renderRn(<Composer {...base} />);
    press(iconButton(container, "add-circle-outline") as Element);

    rerender(<Composer {...base} mediaBusy />);
    expect(iconButton(container, "images-outline")).toBeNull();
    rerender(<Composer {...base} />);

    expect(iconButton(container, "images-outline")).toBeNull();
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

  /**
   * Au plafond, sans relais, la capture s'arrête et le bandeau part avec elle : c'est la barre qui
   * le dit, au plafond du MESSAGE — une réponse à un débrief passe par ici aussi (#856).
   */
  it("dit l'arrêt au plafond jusqu'au prochain enregistrement", () => {
    const { container, queryByText } = renderRn(<Composer {...base} />);
    // Le fil n'a pas de quota : c'est la barre qui borne le relais, pour un micro oublié en poche.
    expect(recorderProps()).toMatchObject({
      maxDurationSeconds: MESSAGE_MEDIA_PROFILE.audioMaxDurationSeconds,
      notesLeft: MESSAGE_AUDIO_NOTES_PER_CAPTURE,
    });
    expect(queryByText("messages.audio.limitReached")).toBeNull();

    act(() => recorderProps().onLimitReached?.());
    expect(queryByText("messages.audio.limitReached")).not.toBeNull();

    press(iconButton(container, "mic-outline") as Element);
    expect(queryByText("messages.audio.limitReached")).toBeNull();
  });

  // #858 : l'écran efface ses erreurs au début d'une capture, pas à chaque note — une note relayée
  // ne passe pas par là. La fin de capture, elle, n'efface rien non plus.
  it("prévient l'écran au début d'une capture, et seulement là", () => {
    const onCaptureStart = vi.fn();
    renderRn(<Composer {...base} onCaptureStart={onCaptureStart} />);

    act(() => recorderProps().onRecordingChange?.(false));
    expect(onCaptureStart).not.toHaveBeenCalled();

    act(() => recorderProps().onRecordingChange?.(true));
    expect(onCaptureStart).toHaveBeenCalledOnce();
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
